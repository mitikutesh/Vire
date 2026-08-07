import type { Profile } from '@/domain/schema';

/** The profile without the target, which only the server may set. */
export type ProfileInput = Omit<Profile, 'target'>;

/**
 * The API port.
 *
 * Same reasoning as the auth and store ports: screens depend on this, so the
 * whole first-run and settings flow is testable with no Lambda, and `npm run
 * dev` works before anything is deployed.
 */
export interface VireApi {
  /** null when the user has no profile yet — what puts the app into first-run. */
  getProfile(): Promise<Profile | null>;

  /**
   * Save the profile and return it **as the server stored it**, including the
   * server-computed target. Callers must use the returned target rather than
   * their own preview: the two agree today, and the server's is authoritative
   * if they ever stop agreeing.
   */
  saveProfile(input: ProfileInput): Promise<Profile>;
}

/** A field-level validation failure the form can attribute to an input. */
export interface FieldIssue {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: FieldIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
