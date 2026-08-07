/**
 * Invite-only registration.
 *
 * Without this, anyone who finds the URL can create an account and spend the
 * household's AI budget: plan generation and the offer scan both bill to the
 * owner's provider key, and per-user rate limits cap each account, not the
 * number of accounts (PLAN §2, decision 4).
 *
 * Kept as a pure function so the matching rules are testable without Cognito.
 */

/** Parse the configured allowlist. Comma or whitespace separated, any case. */
export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * Whether this address may register.
 *
 * An empty allowlist denies everyone. That is deliberate: a misconfigured or
 * missing secret must fail closed, because failing open here means an open
 * registration endpoint attached to a paid API key.
 */
export function isAllowed(email: string, allowlist: readonly string[]): boolean {
  const candidate = email.trim().toLowerCase();
  if (!candidate || allowlist.length === 0) return false;

  return allowlist.some((entry) => {
    // A `@example.com` entry admits a whole domain — useful for a household on
    // its own domain, and harmless for a single-address list.
    if (entry.startsWith('@')) return candidate.endsWith(entry);
    return candidate === entry;
  });
}
