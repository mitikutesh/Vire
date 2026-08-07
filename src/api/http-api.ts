import type { WeekdayIndex } from '@/domain/constants';
import { dataOf, parsePlanEvent, takeFrames } from '@/domain/plan-stream';
import type { ReportedDayState } from '@/domain/plan-stream';
import type { DailyLog, GrocState, Profile, StoredPlan } from '@/domain/schema';
import {
  ApiError,
  PlanGenerationError,
  type DatedLog,
  type DatedWeight,
  type FieldIssue,
  type PlanFailure,
  type ProfileInput,
  type VireApi,
} from './types';

/**
 * The real API client.
 *
 * Every request carries a bearer token, because the server derives the storage
 * partition from the verified token and refuses anything without one. The token
 * is fetched per request rather than captured once, so a refreshed token is
 * picked up without rebuilding the client.
 */
export class HttpVireApi implements VireApi {
  constructor(
    private readonly baseUrl: string,
    private readonly accessToken: () => Promise<string | null>,
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.accessToken();
    if (!token) {
      // Surfaced as 401 so callers treat it exactly like a rejected token.
      throw new ApiError(401, 'not_signed_in');
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          ...init.headers,
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
      });
    } catch (cause) {
      // A transport failure is not a server response; status 0 keeps the two
      // distinguishable for callers that retry. Logged because the user only
      // sees "no connection", which hides a CORS or URL mistake.
      console.error('[vire] API request failed before reaching the server', cause);
      throw new ApiError(0, 'network', []);
    }
    return response;
  }

  private static async fail(response: Response): Promise<never> {
    let error = 'request_failed';
    let issues: FieldIssue[] = [];
    try {
      const body = (await response.json()) as { error?: string; issues?: FieldIssue[] };
      error = body.error ?? error;
      issues = body.issues ?? [];
    } catch {
      // A non-JSON error body (a gateway page, say) is still a failure; the
      // status is the useful part.
    }
    throw new ApiError(response.status, error, issues);
  }

  async getProfile(): Promise<Profile | null> {
    const response = await this.request('/profile');
    // Not an error: "no profile yet" is the normal first-run state.
    if (response.status === 404) return null;
    if (!response.ok) return HttpVireApi.fail(response);
    return (await response.json()) as Profile;
  }

  async saveProfile(input: ProfileInput): Promise<Profile> {
    const response = await this.request('/profile', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    if (!response.ok) return HttpVireApi.fail(response);
    // The server's copy, including the target it computed.
    return (await response.json()) as Profile;
  }

  async getPlan(): Promise<StoredPlan | null> {
    const response = await this.request('/plan');
    if (response.status === 404) return null;
    if (!response.ok) return HttpVireApi.fail(response);
    return (await response.json()) as StoredPlan;
  }

  async adoptStarterPlan(): Promise<StoredPlan> {
    const response = await this.request('/plan/starter', { method: 'POST' });
    if (!response.ok) return HttpVireApi.fail(response);
    return (await response.json()) as StoredPlan;
  }

  async getLog(date: string): Promise<DailyLog | null> {
    const response = await this.request(`/log/${date}`);
    if (!response.ok) return HttpVireApi.fail(response);
    // 200 with a null body: an untouched day is not an error.
    return (await response.json()) as DailyLog | null;
  }

  async saveLog(date: string, log: DailyLog): Promise<DailyLog> {
    const response = await this.request(`/log/${date}`, {
      method: 'PUT',
      body: JSON.stringify(log),
    });
    if (!response.ok) return HttpVireApi.fail(response);
    return (await response.json()) as DailyLog;
  }

  async getGrocState(planId: string): Promise<GrocState> {
    const response = await this.request(`/groc/${planId}`);
    if (!response.ok) return HttpVireApi.fail(response);
    return (await response.json()) as GrocState;
  }

  async saveGrocState(planId: string, state: GrocState): Promise<GrocState> {
    const response = await this.request(`/groc/${planId}`, {
      method: 'PUT',
      body: JSON.stringify(state),
    });
    if (!response.ok) return HttpVireApi.fail(response);
    return (await response.json()) as GrocState;
  }

  async listLogs(): Promise<DatedLog[]> {
    const response = await this.request('/logs');
    if (!response.ok) return HttpVireApi.fail(response);
    return (await response.json()) as DatedLog[];
  }

  async listWeights(): Promise<DatedWeight[]> {
    const response = await this.request('/weight');
    if (!response.ok) return HttpVireApi.fail(response);
    return (await response.json()) as DatedWeight[];
  }

  async saveWeighIn(
    date: string,
    kg: number,
    applyToProfile: boolean,
  ): Promise<{ entry: DatedWeight; profile: Profile }> {
    const response = await this.request(`/weight/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ kg, applyToProfile }),
    });
    if (!response.ok) return HttpVireApi.fail(response);
    const body = (await response.json()) as { entry: { kg: number }; profile: Profile };
    return { entry: { date, kg: body.entry.kg }, profile: body.profile };
  }

  async generatePlan(
    onDay: (day: WeekdayIndex, state: ReportedDayState) => void,
  ): Promise<StoredPlan> {
    const response = await this.request('/plan/generate', { method: 'POST' });
    // A refusal (no profile, rate limit) arrives as a status before the stream
    // starts, so it is an ApiError like any other request.
    if (!response.ok) return HttpVireApi.fail(response);
    if (!response.body) throw new ApiError(0, 'network');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let plan: StoredPlan | null = null;
    let failure: PlanFailure | null = null;
    let failedDays: readonly number[] = [];

    try {
      for (;;) {
        const { done, value } = await reader.read();
        // `stream: true` matters: a multi-byte character can straddle a chunk,
        // and the decoder holds the partial sequence until the rest arrives.
        buffer += decoder.decode(value, { stream: !done });
        const { frames, rest } = takeFrames(buffer);
        buffer = rest;

        for (const frame of frames) {
          const event = parsePlanEvent(dataOf(frame));
          if (!event) continue;
          if (event.type === 'day') onDay(event.day, event.state);
          else if (event.type === 'plan') plan = event.plan;
          else {
            failure = event.error;
            if (event.error === 'partial') failedDays = event.failedDays;
          }
        }
        if (done) break;
      }
    } finally {
      // Releasing the lock lets the connection be reused, and matters most on
      // the paths that leave the stream early.
      reader.releaseLock();
    }

    if (plan) return plan;
    if (failure) throw new PlanGenerationError(failure, failedDays);

    // The stream ended without a verdict. The plan may still have been stored
    // just before the connection dropped, so ask before charging the user for a
    // second generation.
    const stored = await this.getPlan().catch(() => null);
    if (stored) return stored;
    throw new PlanGenerationError('dropped');
  }
}
