/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute API base URL. Env-configured so the same bundle works on
   *  CloudFront and inside the Capacitor shell in M6 (PLAN §2.2). */
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
