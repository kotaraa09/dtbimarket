/**
 * Homework 3 — the two-level AI assistant. ADR-0007.
 *
 * Level 1  POST /ai/products/:id/description   one call, one draft, saved by nobody
 * Level 2  POST /ai/summary                    read three tables, summarise, write back, log
 *          GET  /ai/summary                    the newest summary for the seller's store
 *          POST /ai/summary/:id/dismiss        the seller closing it
 *
 * Events: ai.description_suggested, ai.summary_generated, ai.summary_dismissed,
 *         ai.call_failed
 *
 * Two shapes in here are deliberate and worth reading before changing:
 *
 *   1. **The model call is never inside a transaction.** It can take fifteen
 *      seconds. A transaction held open that long against a free-tier Postgres
 *      with a connection pool in front of it will exhaust the pool and take
 *      down sign-in, which has nothing to do with this feature. Read, call,
 *      then open a short transaction to write the result and its event.
 *
 *   2. **A failed call still writes.** `ai_run_log` gets a row and
 *      `ai.call_failed` is emitted. A feature that records only its successes
 *      reports a 100% success rate forever, and the worksheet's own checklist
 *      asks whether a failed call leaves the system stuck — which cannot be
 *      answered from data that was never written.
 *
 * **Nothing here changes a product, a price, a photo or a publication state.**
 * Level 1 returns text the seller pastes or ignores; Level 2 writes only into
 * `ai_summary`. The AI never decides alone.
 */
import { Router } from 'express';
import { Prisma, prisma } from '@dtbi/db';
import type { AiSummary, Store } from '@dtbi/db';
import type { AiSummaryDto, AiSummaryMetricSnapshot } from '@dtbi/shared';
import { emitEvent } from '../../events/emit.ts';
import { AppError, errors } from '../../middleware/errors.ts';
import {
  attachSession,
  authedUser,
  requireSeller,
  scopedStore,
} from '../../middleware/session.ts';
import { requireOwnProduct, requireOwnStore } from '../../middleware/store-scope.ts';
import { loadedProduct } from '../products/loaded.ts';
import { getClock } from '../../lib/clock.ts';
import {
  AI_ERROR_MESSAGES_TH,
  AiCallError,
  assertNoContactData,
  callModel,
  configuredModel,
  isAiEnabled,
  type AiErrorCode,
} from './openrouter.ts';
import {
  PROMPT_VERSION,
  buildDescriptionPrompt,
  buildSummaryPrompt,
  parseSummary,
  summaryFacts,
} from './prompts.ts';
import { ungroundedNumbers } from './grounding.ts';
import { buildStoreSnapshot } from './snapshot.ts';

export const aiRouter: Router = Router();

const sellerScope = [attachSession, requireSeller, requireOwnStore] as const;

/**
 * A budget guard, not a security control.
 *
 * The OpenRouter key is issued per student with a fixed allowance, and a seller
 * holding the button down is the cheapest way to spend all of it before the
 * instructor opens the site. Twelve calls in ten minutes is far above ordinary
 * use and far below what a stuck retry loop produces.
 */
const RATE_WINDOW_MINUTES = 10;
const RATE_LIMIT_CALLS = 12;

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

/** 503 rather than 500: the platform is fine, this one dependency is not. */
function aiUnavailable(code: AiErrorCode): AppError {
  return new AppError(503, `ai_${code}`, AI_ERROR_MESSAGES_TH[code]);
}

async function assertWithinBudget(storeId: string): Promise<void> {
  const since = new Date(
    getClock().now().getTime() - RATE_WINDOW_MINUTES * 60 * 1000,
  );
  const recent = await prisma.aiRunLog.count({
    where: { storeId, createdAt: { gte: since } },
  });
  if (recent >= RATE_LIMIT_CALLS) {
    throw new AppError(
      429,
      'ai_rate_limited',
      `เรียก AI บ่อยเกินไป — รออีกสักครู่แล้วลองใหม่ (จำกัด ${RATE_LIMIT_CALLS} ครั้งต่อ ${RATE_WINDOW_MINUTES} นาที)`,
    );
  }
}

interface FailureRecord {
  store: Store;
  kind: 'product_description' | 'store_summary';
  promptText: string;
  responseText?: string | null;
  code: AiErrorCode;
  durationMs: number;
}

/** The log row and the event for a call that did not produce a usable answer. */
async function recordFailure(actorId: string, f: FailureRecord): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.aiRunLog.create({
      data: {
        storeId: f.store.id,
        kind: f.kind,
        status: 'failed',
        model: configuredModel(),
        promptVersion: PROMPT_VERSION,
        promptText: f.promptText,
        responseText: f.responseText ?? null,
        errorCode: f.code,
        durationMs: f.durationMs,
        createdAt: getClock().now(),
        isSeed: f.store.isSeed,
      },
    });

    await emitEvent(tx, {
      type: 'ai.call_failed',
      actorType: 'seller',
      actorId,
      storeId: f.store.id,
      isSeed: f.store.isSeed,
      payload: { kind: f.kind, error_code: f.code, duration_ms: f.durationMs },
    });
  });
}

function toAiSummaryDto(row: AiSummary): AiSummaryDto {
  return {
    id: row.id,
    summary: row.summary,
    suggestedAction: row.suggestedAction,
    metricSnapshot: row.metricSnapshot as unknown as AiSummaryMetricSnapshot,
    model: row.model,
    promptVersion: row.promptVersion,
    generatedAt: row.generatedAt.toISOString(),
    dismissedAt: row.dismissedAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Level 1 — POST /ai/products/:id/description
// ---------------------------------------------------------------------------
//
// Returns a draft. It does NOT write to the product: saving is PATCH
// /products/:id, which the seller triggers after reading and editing, and which
// emits `product.description_changed` with `from_ai: true`. Two acts, two
// events, and the study can tell "the AI wrote something" apart from "the
// seller kept it" — which is the only version of this feature worth measuring.

aiRouter.post(
  '/products/:id/description',
  ...sellerScope,
  requireOwnProduct,
  async (_req, res, next) => {
    try {
      if (!isAiEnabled()) throw aiUnavailable('not_configured');

      const auth = authedUser(res);
      const store = scopedStore(res);
      const product = loadedProduct(res);

      await assertWithinBudget(store.id);

      const { system, user } = buildDescriptionPrompt({
        storeName: store.name,
        storeCategory: store.category,
        productName: product.name,
        priceSatang: product.priceSatang,
        stock: product.stock,
      });

      // REQ-N2. The prompt is built from business fields only; this is the
      // check that it stayed that way.
      assertNoContactData(user, [store.contactChannel, auth.user.displayName, auth.user.email]);

      let result;
      try {
        result = await callModel(system, user);
      } catch (err) {
        if (err instanceof AiCallError) {
          await recordFailure(auth.user.id, {
            store,
            kind: 'product_description',
            promptText: user,
            code: err.code,
            durationMs: 0,
          });
          throw aiUnavailable(err.code);
        }
        throw err;
      }

      // Models add quotation marks around a thing they were told is a quotation
      // of nothing. Strip them rather than showing the seller a quoted draft.
      const suggestion = result.text.replace(/^["'“”„]+|["'“”„]+$/g, '').trim();

      await prisma.$transaction(async (tx) => {
        await tx.aiRunLog.create({
          data: {
            storeId: store.id,
            kind: 'product_description',
            status: 'ok',
            model: result.model,
            promptVersion: PROMPT_VERSION,
            promptText: user,
            responseText: result.text,
            durationMs: result.durationMs,
            createdAt: getClock().now(),
            isSeed: store.isSeed,
          },
        });

        await emitEvent(tx, {
          type: 'ai.description_suggested',
          actorType: 'seller',
          actorId: auth.user.id,
          storeId: store.id,
          isSeed: store.isSeed,
          entityType: 'product',
          entityId: product.id,
          // The length, never the text. A description is free text and the
          // event table is the one place it must not end up (REQ-N2).
          payload: {
            suggestion_length: suggestion.length,
            duration_ms: result.durationMs,
          },
        });
      });

      res.status(200).json({ suggestion, model: result.model });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Level 2 — GET /ai/summary
// ---------------------------------------------------------------------------
//
// `enabled` rides along so the dashboard can label the button honestly before
// anyone presses it, without a second round trip for a boolean.

aiRouter.get('/summary', ...sellerScope, async (_req, res, next) => {
  try {
    const store = scopedStore(res);
    const latest = await prisma.aiSummary.findFirst({
      where: { storeId: store.id, dismissedAt: null },
      orderBy: { generatedAt: 'desc' },
    });

    res.status(200).json({
      enabled: isAiEnabled(),
      summary: latest ? toAiSummaryDto(latest) : null,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Level 2 — POST /ai/summary
// ---------------------------------------------------------------------------

aiRouter.post('/summary', ...sellerScope, async (_req, res, next) => {
  try {
    if (!isAiEnabled()) throw aiUnavailable('not_configured');

    const auth = authedUser(res);
    const store = scopedStore(res);

    await assertWithinBudget(store.id);

    // Step 1 — read. Three tables, none of them the model's business to guess at.
    const snapshot = await buildStoreSnapshot(store);
    const facts = summaryFacts(snapshot).map((f) => f.value);

    if (snapshot.productCount === 0) {
      // Refusing beats summarising nothing. A model handed all-zero facts
      // writes an encouraging paragraph about potential, which is exactly the
      // ungrounded prose rule 7 exists to keep out.
      throw new AppError(
        409,
        'ai_no_data',
        'ยังไม่มีสินค้าให้สรุป — เพิ่มสินค้าอย่างน้อย 1 รายการก่อน',
      );
    }

    // Step 2 — summarise. One corrective retry, then give up: a model that
    // ignores the format twice will ignore it a third time, and the seller is
    // waiting.
    let attempt = 0;
    let correction: string | undefined;
    let parsed: ReturnType<typeof parseSummary> = null;
    let lastPrompt = '';
    let lastText: string | null = null;
    let lastCode: AiErrorCode = 'unparsable';
    let totalMs = 0;
    let model = configuredModel();

    while (attempt < 2 && parsed === null) {
      attempt += 1;
      const { system, user } = buildSummaryPrompt(store.name, snapshot, correction);
      lastPrompt = user;

      assertNoContactData(user, [
        store.contactChannel,
        auth.user.displayName,
        auth.user.email,
      ]);

      let result;
      try {
        result = await callModel(system, user);
      } catch (err) {
        if (err instanceof AiCallError) {
          await recordFailure(auth.user.id, {
            store,
            kind: 'store_summary',
            promptText: user,
            code: err.code,
            durationMs: totalMs,
          });
          throw aiUnavailable(err.code);
        }
        throw err;
      }

      totalMs += result.durationMs;
      model = result.model;
      lastText = result.text;

      const candidate = parseSummary(result.text);
      if (candidate === null) {
        lastCode = 'unparsable';
        correction = 'ตอบใหม่ให้มีเฉพาะสองบรรทัดที่ขึ้นต้นด้วย "สรุป:" และ "ควรทำต่อ:"';
        continue;
      }

      // Step 2b — the grounding check, before anything is stored or shown.
      const offenders = ungroundedNumbers(
        `${candidate.summary}\n${candidate.suggestedAction}`,
        facts,
      );
      if (offenders.length > 0) {
        lastCode = 'ungrounded';
        correction = `ห้ามใช้ตัวเลข ${offenders.join(', ')} เพราะไม่มีในข้อมูลร้าน ใช้เฉพาะตัวเลขที่ให้มา`;
        continue;
      }

      parsed = candidate;
    }

    if (parsed === null) {
      await recordFailure(auth.user.id, {
        store,
        kind: 'store_summary',
        promptText: lastPrompt,
        responseText: lastText,
        code: lastCode,
        durationMs: totalMs,
      });
      throw aiUnavailable(lastCode);
    }

    // Bound now so the transaction closure below sees a non-null value rather
    // than re-widening `parsed` back to nullable.
    const answer = parsed;

    // Step 3 — write the result back, and step 4 — log the run. One
    // transaction, so a summary can never exist without the record of the call
    // that produced it, and neither can exist without its event.
    const generatedAt = getClock().now();
    const created = await prisma.$transaction(async (tx) => {
      const summary = await tx.aiSummary.create({
        data: {
          storeId: store.id,
          summary: answer.summary,
          suggestedAction: answer.suggestedAction,
          metricSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          model,
          promptVersion: PROMPT_VERSION,
          generatedAt,
          isSeed: store.isSeed,
        },
      });

      await tx.aiRunLog.create({
        data: {
          storeId: store.id,
          summaryId: summary.id,
          kind: 'store_summary',
          status: 'ok',
          model,
          promptVersion: PROMPT_VERSION,
          promptText: lastPrompt,
          responseText: lastText,
          durationMs: totalMs,
          createdAt: generatedAt,
          isSeed: store.isSeed,
        },
      });

      await emitEvent(tx, {
        type: 'ai.summary_generated',
        actorType: 'seller',
        actorId: auth.user.id,
        storeId: store.id,
        isSeed: store.isSeed,
        entityType: 'ai_summary',
        entityId: summary.id,
        payload: {
          summary_id: summary.id,
          product_count: snapshot.productCount,
          published_count: snapshot.publishedCount,
          photos_missing_count: snapshot.photosMissingCount,
          duration_ms: totalMs,
        },
      });

      return summary;
    });

    res.status(201).json({ summary: toAiSummaryDto(created) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Level 2 — POST /ai/summary/:id/dismiss
// ---------------------------------------------------------------------------
//
// The row stays and `dismissed_at` is set. Deleting it would lose the record
// that the seller was shown this text, which is the only thing that makes
// "they ignored it" distinguishable from "they never saw it".

aiRouter.post('/summary/:id/dismiss', ...sellerScope, async (req, res, next) => {
  try {
    const auth = authedUser(res);
    const store = scopedStore(res);

    const raw = req.params.id;
    const id = Array.isArray(raw) ? raw[0] : raw;
    const existing = id
      ? await prisma.aiSummary.findUnique({ where: { id } })
      : null;

    // 404 for another store's summary, like every other scoped resource here:
    // a 403 would confirm the ID is real.
    if (!existing || existing.storeId !== store.id) {
      throw errors.notFound('ai_summary_not_found', 'ไม่พบสรุปนี้');
    }
    if (existing.dismissedAt) {
      return res.status(200).json({ summary: toAiSummaryDto(existing) });
    }

    const now = getClock().now();
    const ageMinutes = Math.max(
      0,
      Math.round((now.getTime() - existing.generatedAt.getTime()) / 60000),
    );

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.aiSummary.update({
        where: { id: existing.id },
        data: { dismissedAt: now },
      });

      await emitEvent(tx, {
        type: 'ai.summary_dismissed',
        actorType: 'seller',
        actorId: auth.user.id,
        storeId: store.id,
        isSeed: store.isSeed,
        entityType: 'ai_summary',
        entityId: row.id,
        payload: { summary_id: row.id, age_minutes: ageMinutes },
      });

      return row;
    });

    res.status(200).json({ summary: toAiSummaryDto(updated) });
  } catch (err) {
    next(err);
  }
});
