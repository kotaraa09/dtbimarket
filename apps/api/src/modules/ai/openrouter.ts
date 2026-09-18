/**
 * The only place in this repository that talks to a language model.
 *
 * One door, for the same reason `events/emit.ts` is one door: the key, the
 * model name, the timeout and the personal-data guard all have to be changed in
 * one place or they will disagree with each other. A second `fetch` to
 * openrouter.ai somewhere else is a bug even if it works.
 *
 * Read ADR-0007 before adding a third caller. ADR-0002 still stands: nothing in
 * here may be used to produce advisor copy while an experiment is running.
 */
import { config } from '../../lib/config.ts';
import { getClock } from '../../lib/clock.ts';

/** The taxonomy the Thai message and the `ai_run_log.error_code` both come from. */
export type AiErrorCode =
  | 'not_configured'
  | 'timeout'
  | 'unauthorised'
  | 'out_of_credit'
  | 'model_not_found'
  | 'rate_limited'
  | 'empty_response'
  | 'unparsable'
  | 'ungrounded'
  | 'unreachable'
  | 'upstream_error';

export class AiCallError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'AiCallError';
    this.code = code;
  }
}

/**
 * Thai, shown to the seller.
 *
 * Every one of these ends by telling them what they can still do. A seller who
 * is told only "AI ใช้ไม่ได้" reasonably concludes the page is broken and stops,
 * when in fact writing the description by hand was always available — and that
 * is the difference between a degraded feature and a blocked seller.
 */
export const AI_ERROR_MESSAGES_TH: Record<AiErrorCode, string> = {
  not_configured:
    'ระบบยังไม่ได้ตั้งค่าคีย์ AI — ใช้งานส่วนอื่นได้ตามปกติ และเขียนเองได้เลย',
  timeout:
    'AI ตอบช้าเกินกำหนด — ลองกดใหม่อีกครั้ง หรือเขียนเองก็ได้ ไม่กระทบการบันทึก',
  unauthorised:
    'คีย์ AI ใช้ไม่ได้หรือถูกเพิกถอน — แจ้งผู้ดูแลระบบ ระหว่างนี้เขียนเองได้ตามปกติ',
  out_of_credit: 'วงเงินของคีย์ AI หมดแล้ว — แจ้งผู้ดูแลระบบ',
  model_not_found:
    'ไม่พบรุ่นโมเดลที่ตั้งค่าไว้ — แจ้งผู้ดูแลระบบให้เปลี่ยนชื่อรุ่น',
  rate_limited: 'เรียก AI ถี่เกินไป — รอสักครู่แล้วกดใหม่',
  empty_response: 'AI ตอบกลับมาแต่ไม่มีเนื้อความ — กดใหม่อีกครั้ง',
  unparsable: 'AI ตอบมาในรูปแบบที่อ่านไม่ได้ — กดใหม่อีกครั้ง',
  // Shown rather than hidden. A summary quoting a number that is not in the
  // store's data is the one failure a seller cannot catch by reading it, so it
  // is refused outright instead of being shown with a caveat.
  ungrounded:
    'AI อ้างตัวเลขที่ไม่มีอยู่ในข้อมูลร้าน จึงไม่แสดงผลให้ — กดใหม่อีกครั้ง',
  unreachable: 'ต่อกับบริการ AI ไม่ได้ — ลองใหม่อีกครั้ง',
  upstream_error: 'เรียก AI ไม่สำเร็จ — ลองใหม่อีกครั้ง',
};

export function isAiEnabled(): boolean {
  return config.ai.enabled;
}

/**
 * The model name, read from the same config the call uses.
 *
 * It exists so a failure row can name a model without a second reading of
 * `process.env` — a log row naming a model that did not answer is worse than no
 * log row, because it is believed.
 */
export function configuredModel(): string {
  return config.ai.enabled ? config.ai.model : 'unconfigured';
}

/**
 * CLAUDE.md rule 8, enforced rather than promised.
 *
 * The prompt builders in this module are written not to include a seller's
 * contact channel, display name or email. This checks that they actually did
 * not, because the failure is silent: a prompt is sent to a third party and
 * stored in `ai_run_log`, and nothing on screen looks any different.
 *
 * Throws rather than redacting. A redacted prompt would still have been built
 * by code that thought putting it there was fine, and that code would keep
 * running.
 */
export function assertNoContactData(
  prompt: string,
  forbidden: readonly (string | null | undefined)[],
): void {
  for (const value of forbidden) {
    const needle = value?.trim();
    // Two characters or fewer matches half the alphabet by accident.
    if (!needle || needle.length < 3) continue;
    if (prompt.includes(needle)) {
      throw new Error(
        'Refusing to send a prompt containing a personal field (REQ-N2, ' +
          'CLAUDE.md rule 8). Build the prompt from store name, category, ' +
          'product name, price, stock and counts only.',
      );
    }
  }
}

export interface AiCallResult {
  text: string;
  durationMs: number;
  model: string;
}

/**
 * One call. Returns the text, or throws `AiCallError`.
 *
 * `temperature: 0` because both callers want the same input to give the same
 * output. Neither is asked for creativity: Level 1 restates fields the seller
 * already typed, and Level 2 restates numbers from a snapshot. It also makes a
 * bad answer reproducible, which is the only way to debug one.
 */
export async function callModel(
  systemPrompt: string,
  userPrompt: string,
): Promise<AiCallResult> {
  const ai = config.ai;
  if (!ai.enabled) {
    throw new AiCallError('not_configured', 'OPENROUTER_API_KEY is not set');
  }

  const startedAt = getClock().now().getTime();

  // The switch that makes the timeout real. Without it `fetch` waits as long as
  // the network does, and the seller's button never comes back.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ai.timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(ai.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ai.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: ai.model,
          temperature: 0,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: abort.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AiCallError('timeout', `no response within ${ai.timeoutMs} ms`);
      }
      throw new AiCallError('unreachable', 'fetch to the model provider failed');
    }

    if (!response.ok) {
      // The body is read for the server log only. It is never returned to the
      // browser: a provider error string can quote the request, and the request
      // contains the prompt.
      const body = await response.text().catch(() => '');
      throw new AiCallError(
        statusToCode(response.status),
        `provider returned ${response.status}: ${body.slice(0, 200)}`,
      );
    }

    const parsed = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = parsed.choices?.[0]?.message?.content?.trim() ?? '';

    // 200 with nothing in it happens, and is a failure like any other.
    if (!text) throw new AiCallError('empty_response', 'no content in choices[0]');

    return {
      text,
      durationMs: getClock().now().getTime() - startedAt,
      model: ai.model,
    };
  } finally {
    // Always, or the timer fires into the next call.
    clearTimeout(timer);
  }
}

function statusToCode(status: number): AiErrorCode {
  if (status === 401 || status === 403) return 'unauthorised';
  if (status === 402) return 'out_of_credit';
  if (status === 404) return 'model_not_found';
  if (status === 429) return 'rate_limited';
  return 'upstream_error';
}

/** Milliseconds a failed call took, for the log row, without a second clock read. */
export function elapsedSince(startedAtMs: number): number {
  return getClock().now().getTime() - startedAtMs;
}
