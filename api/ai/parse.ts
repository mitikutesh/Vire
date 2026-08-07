import {
  AiOutputError,
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

  const parsed = generatedDaySchema.safeParse(json);
  if (!parsed.success) {
    throw new AiOutputError(`Day ${weekday} failed validation`, parsed.error);
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
