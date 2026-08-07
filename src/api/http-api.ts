import type { Profile } from '@/domain/schema';
import { ApiError, type FieldIssue, type ProfileInput, type VireApi } from './types';

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
}
