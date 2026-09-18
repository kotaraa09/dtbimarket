/**
 * The grounding guard, made mechanical.
 *
 * CLAUDE.md rule 7 says the advisor may only state facts it can point to, and
 * `advisor-recommendation` calls that "the whole moat". This feature is not the
 * advisor, but the argument transfers exactly: a summary of a seller's own shop
 * that quotes a number the shop does not have is worth less than no summary,
 * because the seller has no way to tell which sentence was the invented one.
 *
 * So the check is not a review. Every run of digits in the model's output must
 * already appear in the facts the model was given. A number it made up — a
 * percentage it computed, a total it added, a comparison with "ร้านอื่น" — has
 * no source, fails here, and the summary is refused.
 *
 * What this cannot catch: an invented sentence with no numbers in it at all
 * ("ลูกค้าน่าจะอยากเห็นรายละเอียดมากกว่านี้"). The prompt forbids those
 * explicitly, and they are the reason `metric_snapshot` is rendered next to the
 * summary in the UI — the seller is shown the source, not asked to trust it.
 */

/** Any run of digits, with grouping commas and an optional decimal part. */
const NUMBER_TOKEN = /\d[\d,]*(?:\.\d+)?/g;

/**
 * Numbers the model may use even though they are not a measurement.
 *
 * `2` is the photo threshold and `7` is the activity window; both appear in the
 * fact labels rather than the values, and a summary saying "มีรูปน้อยกว่า 2 รูป"
 * is quoting the question it was asked, not inventing an answer.
 */
const STRUCTURAL_NUMBERS = ['2', '7'];

function normalise(token: string): string {
  const withoutCommas = token.replace(/,/g, '');
  // "12.00" and "12" are the same figure; formatSatang always writes two
  // decimal places and a model restating it often drops them.
  return withoutCommas.replace(/\.0+$/, '');
}

export function allowedNumbers(factValues: readonly string[]): Set<string> {
  const allowed = new Set<string>(STRUCTURAL_NUMBERS);
  for (const value of factValues) {
    for (const match of value.matchAll(NUMBER_TOKEN)) {
      allowed.add(normalise(match[0]));
      // The undecorated integer part too: a fact of "1,250.00 บาท" licenses
      // both "1,250.00" and "1250".
      const [whole] = normalise(match[0]).split('.');
      if (whole) allowed.add(whole);
    }
  }
  return allowed;
}

/**
 * Returns the number tokens in `text` that no fact supports. Empty means clean.
 */
export function ungroundedNumbers(
  text: string,
  factValues: readonly string[],
): string[] {
  const allowed = allowedNumbers(factValues);
  const offenders: string[] = [];

  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const token = normalise(match[0]);
    if (!allowed.has(token) && !offenders.includes(token)) offenders.push(token);
  }

  return offenders;
}
