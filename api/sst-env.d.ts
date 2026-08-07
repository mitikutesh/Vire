/**
 * Placeholder typings for SST linked resources.
 *
 * SST generates these itself (as `sst-env.d.ts`) the first time a stage is
 * deployed or `sst dev` runs. Until the one-time OIDC bootstrap in
 * docs/CICD.md has happened, no deploy has ever run, so `Resource.X` would not
 * typecheck and CI would be red for a reason unrelated to the code.
 *
 * The shapes match what SST emits for each component type. When the generated
 * file appears and these become redundant, delete this file rather than editing
 * it — two declarations of the same member only merge while they agree
 * exactly, so keeping both in sync by hand is a trap.
 */
declare module 'sst' {
  export interface Resource {
    /** Comma- or whitespace-separated e-mails permitted to register. */
    SignupAllowlist: { type: 'sst.sst.Secret'; value: string };
    AnthropicApiKey: { type: 'sst.sst.Secret'; value: string };
    OpenaiApiKey: { type: 'sst.sst.Secret'; value: string };
    Data: { type: 'sst.aws.Dynamo'; name: string };
    Api: { type: 'sst.aws.Function'; url: string };
    Users: { type: 'sst.aws.CognitoUserPool'; id: string };
    /** The Cognito app client. The static site is `Site`, so the names differ. */
    Web: { type: 'sst.aws.CognitoUserPoolClient'; id: string };
    Site: { type: 'sst.aws.StaticSite'; url: string };
  }
}

export {};
