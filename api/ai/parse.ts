import {
  AiOutputError,
  MAX_ITEMS_PER_DAY,
  generatedDaySchema,
  offerScanResultSchema,
  type GeneratedDay,
  type OfferScanResult,
} from './types';

/**
 * Response parsing, shared by every adapter.
 *
 * Model output is untrusted input: it can be prose-wrapped, fenced, truncated,
 * a refusal, or valid JSON of the wrong shape. Keeping the handling in one place
 * means a new adapter cannot be lenient in a way the others are not.
 */

/**
 * Pull the JSON object out of a text response.
 *
 * Models wrap JSON in prose or a fenced block even when asked not to, so
 * slicing between the first `{` and the last `}` is deliberate tolerance. The
 * result is then schema-validated, so a wrong *shape* still fails loudly.
 */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new AiOutputError('response contained no JSON object');
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (cause) {
    throw new AiOutputError('response contained malformed JSON', cause);
  }
}

/**
 * Validate one generated day.
 *
 * The error always names the weekday, because the caller retries days
 * individually: a week where one day failed should cost one more request, not
 * seven (PLAN §6, I2).
 */
/**
 * Salvage the grocery rows before validating the day.
 *
 * Models drift on list length and row shape far more readily than on the meals
 * themselves. Dropping a malformed row and capping the list keeps a day whose
 * food is fine, where strict validation would discard all of it and report the
 * day as failed. Anything dropped is logged, so drift stays visible rather than
 * becoming silent data loss.
 */
export function sanitiseItems(json: unknown, weekday: number): unknown {
  if (typeof json !== 'object' || json === null) return json;
  const day = json as Record<string, unknown>;
  if (!Array.isArray(day['items'])) return json;

  const rows = day['items'] as unknown[];
  const usable = rows.filter(
    (row) =>
      Array.isArray(row) &&
      row.length >= 4 &&
      row.length <= 5 &&
      row.every((cell) => typeof cell === 'string' || typeof cell === 'number'),
  );
  const kept = usable.slice(0, MAX_ITEMS_PER_DAY);

  if (kept.length !== rows.length) {
    console.warn(
      `Day ${weekday}: kept ${kept.length} of ${rows.length} grocery rows ` +
        `(${rows.length - usable.length} malformed, ${usable.length - kept.length} over the cap)`,
    );
  }
  return { ...day, items: kept };
}

export function parseDay(text: string, weekday: number): GeneratedDay {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch (cause) {
    throw new AiOutputError(
      `Day ${weekday} did not return usable JSON: ${(cause as Error).message}`,
      cause,
    );
  }

  const parsed = generatedDaySchema.safeParse(sanitiseItems(json, weekday));
  if (!parsed.success) {
    // The message names the failing paths, so a log says *what* drifted rather
    // than only that something did.
    const where = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new AiOutputError(`Day ${weekday} failed validation at: ${where}`, parsed.error);
  }
  return parsed.data;
}

export function parseOfferScan(text: string): OfferScanResult {
  const parsed = offerScanResultSchema.safeParse(extractJson(text));
  if (!parsed.success) {
    // An unvalidated scan could badge an item with an invented store code, or
    // show a price the model never actually found.
    throw new AiOutputError('Offer scan failed validation', parsed.error);
  }
  return parsed.data;
}
