/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute API base URL. Env-configured so the same bundle works on
   *  CloudFront and inside the Capacitor shell in M6 (PLAN §2.2). */
  readonly VITE_API_BASE_URL: string;
  /** Injected by SST at build time. Absent before the first deploy, which is
   *  what makes the app fall back to the in-memory auth fake in development. */
  readonly VITE_COGNITO_USER_POOL_ID?: string;
  readonly VITE_COGNITO_CLIENT_ID?: string;
  /** Hosted-UI domain — required only for Google sign-in. */
  readonly VITE_COGNITO_OAUTH_DOMAIN?: string;
  readonly VITE_AWS_REGION?: string;
  /**
   * `fake` builds against the in-memory auth fake. Needed for the Playwright
   * preview build, which has no user pool: without it a production build with no
   * Cognito configuration throws at startup by design.
   */
  readonly VITE_AUTH_MODE?: 'fake';
  /**
   * Restrict who may register against the development fake. Unset means any
   * address may register locally — the allowlist protects a real AI budget, and
   * there is none behind the fake.
   */
  readonly VITE_DEV_ALLOWLIST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
