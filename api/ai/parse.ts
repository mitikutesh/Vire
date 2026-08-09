import { SLOTS } from '@/content/plan';
import {
  AiOutputError,
  MAX_ITEMS_PER_DAY,
  MAX_PREP_LEAD_MIN,
  MAX_PREP_STAGES,
  MIN_PREP_LEAD_MIN,
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

/**
 * Rewrite the dashes models reach for in prose.
 *
 * Every generated meal name, step and ingredient is copy the user reads, so it
 * has to sound like the rest of the app. An em dash between clauses is the
 * clearest tell that a machine wrote the line, and no prompt wording suppresses
 * it reliably. Doing it here, at the one boundary model text crosses, means the
 * UI cannot render a dash the hand-written copy would never use.
 *
 * A dash *between digits* is a range ("5–7 min"), not punctuation, so it becomes
 * a plain hyphen instead of a sentence break.
 */
export function deDash(value: string): string {
  return value
    .replace(/(\d)\s*[—–]\s*(\d)/g, '$1-$2')
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s+–\s+/g, ', ')
    .replace(/–/g, '-');
}

/** Apply {@link deDash} to every string in a parsed response, at any depth. */
export function deDashDeep<T>(value: T): T {
  if (typeof value === 'string') return deDash(value) as T;
  if (Array.isArray(value)) return value.map(deDashDeep) as T;
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, deDashDeep(inner)]),
    ) as T;
  }
  return value;
}

/**
 * Drop prep stages the scheduler could not honour (E7.7).
 *
 * Model output is untrusted here as everywhere else, and prep is the field where
 * a bad value is not cosmetic: a stage the app schedules into the night, or one
 * whose window is inverted, produces either an alarm nobody can act on or an
 * instruction that is unsafe by the time it fires.
 *
 * Four rules, each with a reason:
 *  - **Snacks carry none.** `s` and `e` are assembly-only by schema (no steps, no
 *    video); prep on them would quietly kill that invariant.
 *  - **`lead` ≥ 60 min.** Without a floor the model annotates "chop the onions,
 *    lead 15" on all thirty-five meals and the feature becomes noise. A head
 *    start begins where a normal cooking window ends.
 *  - **`leadMax` ≥ `lead`.** An inverted window has no valid instant in it.
 *  - **`active` ≤ `lead`.** Hands-on time longer than the head start is a
 *    misunderstanding of the field, not a tight schedule.
 *
 * Dropping the stage rather than the day is deliberate and matches
 * `sanitiseItems`: a meal whose food is fine should not be lost because its
 * timing advice was malformed.
 */
export function sanitisePrep(json: unknown, weekday: number): unknown {
  if (typeof json !== 'object' || json === null) return json;
  const day = { ...(json as Record<string, unknown>) };

  for (const slot of SLOTS) {
    const meal = day[slot];
    if (typeof meal !== 'object' || meal === null) continue;
    const { prep, ...withoutPrep } = meal as Record<string, unknown>;
    if (prep === undefined) continue;

    // Assembly-only slots keep no prep at all, however plausible it looked.
    const stages = slot === 's' || slot === 'e' ? [] : Array.isArray(prep) ? prep : [];
    const kept = stages.filter(usablePrepStage).slice(0, MAX_PREP_STAGES);

    if (kept.length !== (Array.isArray(prep) ? prep.length : 0)) {
      console.warn(
        `Day ${weekday} ${slot}: kept ${kept.length} of ` +
          `${Array.isArray(prep) ? prep.length : 0} prep stages ` +
          '(out of range, inverted window, or an assembly-only slot)',
      );
    }
    day[slot] = kept.length > 0 ? { ...withoutPrep, prep: kept } : withoutPrep;
  }
  return day;
}

function usablePrepStage(stage: unknown): boolean {
  if (typeof stage !== 'object' || stage === null) return false;
  const { lead, leadMax, active } = stage as Record<string, unknown>;
  if (typeof lead !== 'number' || lead < MIN_PREP_LEAD_MIN || lead > MAX_PREP_LEAD_MIN) {
    return false;
  }
  if (leadMax !== undefined) {
    if (typeof leadMax !== 'number' || leadMax < lead || leadMax > MAX_PREP_LEAD_MIN) return false;
  }
  return typeof active === 'number' && active >= 0 && active <= lead;
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

  const parsed = generatedDaySchema.safeParse(
    deDashDeep(sanitisePrep(sanitiseItems(json, weekday), weekday)),
  );
  if (!parsed.success) {
    // The message names the failing paths, so a log says *what* drifted rather
    // than only that something did.
    const where = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new AiOutputError(`Day ${weekday} failed validation at: ${where}`, parsed.error);
  }
  return parsed.data;
}

export function parseOfferScan(text: string): OfferScanResult {
  const parsed = offerScanResultSchema.safeParse(deDashDeep(extractJson(text)));
  if (!parsed.success) {
    // An unvalidated scan could badge an item with an invented store code, or
    // show a price the model never actually found.
    throw new AiOutputError('Offer scan failed validation', parsed.error);
  }
  return parsed.data;
}
