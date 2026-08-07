import { profileSchema } from '@/domain/schema';
import type { Profile } from '@/domain/schema';
import { calcTarget } from '@/domain/target';
import { ApiError, type ProfileInput, type VireApi } from './types';

/**
 * In-memory API, for tests and for `npm run dev` before a Lambda exists.
 *
 * It computes the target with the *same* `calcTarget` the route uses, so the
 * floors behave identically here and in production — the point of the fake is to
 * remove the network, not to reimplement the rules.
 */
export class MemoryVireApi implements VireApi {
  private profile: Profile | null;

  constructor(profile: Profile | null = null) {
    this.profile = profile;
  }

  async getProfile(): Promise<Profile | null> {
    return this.profile ? structuredClone(this.profile) : null;
  }

  async saveProfile(input: ProfileInput): Promise<Profile> {
    const candidate: Profile = { ...input, target: calcTarget(input) };

    const parsed = profileSchema.safeParse(candidate);
    if (!parsed.success) {
      // Mirrors the route's 422 so the form's error handling is exercised.
      throw new ApiError(
        422,
        'invalid_profile',
        parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    this.profile = parsed.data;
    return structuredClone(parsed.data);
  }
}
