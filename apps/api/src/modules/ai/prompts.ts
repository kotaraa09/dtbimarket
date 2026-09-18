/**
 * Every prompt this repository sends, in one file.
 *
 * `PROMPT_VERSION` is stored on every `ai_summary` and every `ai_run_log` row.
 * Without it, two summaries written a month apart look comparable and are not:
 * the wording of the instruction is as much a cause of the output as the data
 * is. Change a prompt below and change the version in the same commit.
 *
 * Note what is NOT here: advisor copy. ADR-0002 keeps the advisor on templates
 * filled from `metric_snapshot`, and rule 4 forbids editing those while an
 * experiment runs. Nothing in this file is delivered as a recommendation.
 */
import {
  STORE_CATEGORY_LABELS_TH,
  formatSatang,
  type AiSummaryMetricSnapshot,
} from '@dtbi/shared';
import { MIN_PHOTOS_PER_PRODUCT } from './snapshot.ts';

/** Bump on any edit below. Stored with every row this file produces. */
export const PROMPT_VERSION = '2026-09-18.1';

// ---------------------------------------------------------------------------
// Level 1 — draft a product description
// ---------------------------------------------------------------------------

/**
 * The constraints exist because the seller is the one who gets complained to.
 *
 * The ban on ingredients is the important one: a model writing about a coffee
 * shop will happily invent a roast and an origin from nothing, the seller
 * accepts a nice-sounding sentence, and a buyer has now been told something
 * untrue about a product a real student sells for real money.
 */
const DESCRIPTION_SYSTEM = [
  'คุณเป็นผู้ช่วยเขียนคำอธิบายสินค้าให้ร้านค้าเล็ก ๆ ของนักศึกษา',
  'เขียนภาษาไทย 1–2 ประโยค ยาวไม่เกิน 180 ตัวอักษร',
  'ใช้ได้เฉพาะข้อมูลที่ให้มาเท่านั้น',
  'ห้ามระบุส่วนผสม วัตถุดิบ แหล่งที่มา รางวัล เวลาส่ง หรือคำรับประกันใด ๆ ที่ไม่ได้ให้มา',
  'ห้ามใส่ราคาเป็นตัวเลข ห้ามใส่เบอร์โทรหรือช่องทางติดต่อ ห้ามใช้อีโมจิ',
  'ตอบกลับมาเป็นข้อความคำอธิบายอย่างเดียว ห้ามมีหัวข้อ ห้ามมีเครื่องหมายคำพูด',
].join('\n');

export interface DescriptionPromptInput {
  storeName: string;
  storeCategory: AiSummaryMetricSnapshot['storeCategory'];
  productName: string;
  priceSatang: number;
  stock: number;
}

export function buildDescriptionPrompt(input: DescriptionPromptInput): {
  system: string;
  user: string;
} {
  // The price goes in as context the model is told not to repeat, because
  // knowing a product costs 15 baht and knowing it costs 1,500 changes the
  // register the sentence should be written in.
  const user = [
    `ชื่อร้าน: ${input.storeName}`,
    `ประเภทร้าน: ${STORE_CATEGORY_LABELS_TH[input.storeCategory]}`,
    `ชื่อสินค้า: ${input.productName}`,
    `ราคา (ใช้กะระดับคำเท่านั้น ห้ามเขียนตัวเลขนี้ลงในคำอธิบาย): ${formatSatang(
      input.priceSatang,
    )} บาท`,
    `จำนวนคงเหลือ: ${input.stock}`,
    '',
    'เขียนคำอธิบายสินค้านี้',
  ].join('\n');

  return { system: DESCRIPTION_SYSTEM, user };
}

// ---------------------------------------------------------------------------
// Level 2 — summarise the store from its own numbers
// ---------------------------------------------------------------------------

/**
 * Labelled lines rather than JSON.
 *
 * A model asked for JSON returns it inside a fenced code block often enough to
 * matter, and the parser that strips fences is the parser that then also has to
 * survive a trailing comma. Two prefixes are the smallest shape that can be
 * validated, and the worksheet's own advice is to pin the shape and give the
 * code a way out when the shape does not arrive.
 */
const SUMMARY_SYSTEM = [
  'คุณเป็นผู้ช่วยสรุปสถานะร้านให้เจ้าของร้านอ่านก่อนตัดสินใจเอง',
  'คุณจะได้รับ "ข้อมูลร้าน" เป็นรายการตัวเลข',
  'ใช้ได้เฉพาะตัวเลขที่ปรากฏในข้อมูลร้านเท่านั้น ห้ามคำนวณตัวเลขใหม่ ห้ามประมาณ ห้ามเทียบกับร้านอื่น',
  'ห้ามพูดถึงยอดเข้าชม คำสั่งซื้อ รายได้ หรือสิ่งที่ผู้ซื้อคิด เพราะไม่มีข้อมูลเหล่านี้',
  'ตอบกลับมาเป็นสองบรรทัดนี้เท่านั้น:',
  'สรุป: <ภาษาไทย 2–3 ประโยค บอกสิ่งที่เห็นจากตัวเลข>',
  'ควรทำต่อ: <ภาษาไทย 1 ประโยค สิ่งที่เจ้าของร้านลงมือทำได้ทันที>',
  'ห้ามมีบรรทัดอื่น ห้ามใช้อีโมจิ ห้ามใช้เครื่องหมายคำพูด',
].join('\n');

/**
 * The facts, as label/value pairs.
 *
 * Exported because the grounding check reads it: the set of number strings the
 * model is allowed to write is exactly the set that appears in these values.
 * Building the prompt and building the allowlist from one place is what stops
 * them drifting apart, which would leave the check either useless or a source
 * of false refusals.
 */
export function summaryFacts(
  snapshot: AiSummaryMetricSnapshot,
): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [
    { label: 'ประเภทร้าน', value: STORE_CATEGORY_LABELS_TH[snapshot.storeCategory] },
    { label: 'สินค้าทั้งหมด', value: `${snapshot.productCount} รายการ` },
    { label: 'เผยแพร่อยู่', value: `${snapshot.publishedCount} รายการ` },
    { label: 'ฉบับร่าง', value: `${snapshot.draftCount} รายการ` },
    { label: 'ซ่อนอยู่', value: `${snapshot.unpublishedCount} รายการ` },
    {
      label: `สินค้าที่เผยแพร่แล้วแต่มีรูปน้อยกว่า ${MIN_PHOTOS_PER_PRODUCT} รูป`,
      value: `${snapshot.photosMissingCount} รายการ`,
    },
    { label: 'รูปสินค้าทั้งหมด', value: `${snapshot.photoCount} รูป` },
    {
      label: 'สินค้าที่เผยแพร่แล้วแต่ของหมด',
      value: `${snapshot.outOfStockCount} รายการ`,
    },
    {
      label: 'การแก้ไขร้านใน 7 วันที่ผ่านมา',
      value: `${snapshot.catalogueChangesLast7Days} ครั้ง`,
    },
  ];

  if (snapshot.lowestPriceSatang !== null && snapshot.highestPriceSatang !== null) {
    facts.push({
      label: 'ช่วงราคาสินค้าที่เผยแพร่',
      value: `${formatSatang(snapshot.lowestPriceSatang)} ถึง ${formatSatang(
        snapshot.highestPriceSatang,
      )} บาท`,
    });
  }

  facts.push({
    label: 'มูลค่าสต๊อกของสินค้าที่เผยแพร่',
    value: `${formatSatang(snapshot.stockValueSatang)} บาท`,
  });

  if (snapshot.daysSinceNewestProduct !== null) {
    facts.push({
      label: 'เพิ่มสินค้าล่าสุดเมื่อ',
      value: `${snapshot.daysSinceNewestProduct} วันก่อน`,
    });
  }
  if (snapshot.daysSinceLastCatalogueChange !== null) {
    facts.push({
      label: 'แก้ไขร้านล่าสุดเมื่อ',
      value: `${snapshot.daysSinceLastCatalogueChange} วันก่อน`,
    });
  }

  return facts;
}

export function buildSummaryPrompt(
  storeName: string,
  snapshot: AiSummaryMetricSnapshot,
  correction?: string,
): { system: string; user: string } {
  const lines = [
    `ชื่อร้าน: ${storeName}`,
    '',
    'ข้อมูลร้าน:',
    ...summaryFacts(snapshot).map((f) => `- ${f.label}: ${f.value}`),
  ];

  // The retry. One corrective pass, then the request fails — see routes.ts.
  if (correction) {
    lines.push('', `แก้ไขตามนี้: ${correction}`);
  }

  return { system: SUMMARY_SYSTEM, user: lines.join('\n') };
}

export interface ParsedSummary {
  summary: string;
  suggestedAction: string;
}

/** Returns null when the two lines are not both there. The caller retries once. */
export function parseSummary(text: string): ParsedSummary | null {
  const summary = matchPrefix(text, 'สรุป');
  const suggestedAction = matchPrefix(text, 'ควรทำต่อ');
  if (!summary || !suggestedAction) return null;
  return { summary, suggestedAction };
}

function matchPrefix(text: string, label: string): string | null {
  for (const raw of text.split('\n')) {
    // Models like to bullet a list they were told not to make.
    const line = raw.trim().replace(/^[-*\s]+/, '');
    if (!line.startsWith(label)) continue;
    const value = line.slice(label.length).replace(/^[:：\s]+/, '').trim();
    if (value) return value;
  }
  return null;
}
