/// <reference path="./.sst/platform/config.d.ts" />

/**
 * Vire infrastructure (PLAN §3, §8).
 *
 * Every component here sits inside an AWS perpetual free tier for a
 * single-household workload, so the running cost is ~€0/month plus AI usage.
 * Nothing sleeps — the reason a managed-Postgres free tier was rejected is that
 * those pause after a week of inactivity, which is fatal for an app opened daily.
 *
 * Not yet applied to a real account: deploying needs the one-time OIDC IAM
 * bootstrap in docs/CICD.md. Treat the resource shapes as reviewed-but-unproven
 * until the first `sst deploy` runs.
 */
export default $config({
  app(input) {
    return {
      name: 'vire',
      // Stockholm: closest EU region to the user, and EU data residency for
      // health-adjacent data (PLAN §8).
      home: 'aws',
      providers: { aws: { region: 'eu-north-1' } },
      // Production must survive a mistaken `sst remove`.
      removal: input.stage === 'prod' ? 'retain' : 'remove',
      protect: input.stage === 'prod',
    };
  },

  async run() {
    const isProd = $app.stage === 'prod';

    /* ─────────────────────────── secrets ───────────────────────────
       Set with `npx sst secret set <Name> <value> --stage prod`. They land in
       SSM and are injected into the Lambda at runtime — never into the client
       bundle, and never into GitHub secrets. */
    const anthropicApiKey = new sst.Secret('AnthropicApiKey');
    const openaiApiKey = new sst.Secret('OpenaiApiKey');
    /** Comma-separated allowlist of e-mails permitted to register. */
    const signupAllowlist = new sst.Secret('SignupAllowlist');

    /* ─────────────────────────── data ─────────────────────────── */
    const table = new sst.aws.Dynamo('Data', {
      fields: { pk: 'string', sk: 'string' },
      primaryIndex: { hashKey: 'pk', rangeKey: 'sk' },
      // Cached offer scans and rate-limit counters carry `expiresAt` and are
      // reaped by DynamoDB itself, so nothing has to sweep them.
      ttl: 'expiresAt',
    });

    /* ─────────────────────────── auth ───────────────────────────
       Registration is invite-only: without this, anyone who found the URL could
       create an account and spend the household's AI budget (PLAN §2, dec. 4).
       The trigger covers Google sign-in too, because federated first sign-in
       also goes through pre-sign-up. */
    const preSignUp = new sst.aws.Function('PreSignUp', {
      handler: 'api/auth/pre-sign-up.handler',
      link: [signupAllowlist],
    });

    const userPool = new sst.aws.CognitoUserPool('Users', {
      usernames: ['email'],
      triggers: { preSignUp: preSignUp.arn },
      transform: {
        userPool: {
          // Cognito's built-in email sender caps at 50/day, which is ample for
          // one household; swap in SES if that ever binds.
          autoVerifiedAttributes: ['email'],
          passwordPolicy: {
            minimumLength: 8,
            requireLowercase: true,
            requireNumbers: true,
            requireSymbols: false,
            requireUppercase: false,
          },
          accountRecoverySetting: {
            recoveryMechanisms: [{ name: 'verified_email', priority: 1 }],
          },
        },
      },
    });

    // PKCE from the browser, tokens in the client — deliberately not cookies, so
    // the same build works inside the Capacitor shell in M6 (PLAN §2.2).
    const userPoolClient = userPool.addClient('Web');

    /* ─────────────────────────── API ───────────────────────────
       A single Hono function behind a Function URL. Streaming is what lets plan
       generation push per-day progress, and the 15-minute Lambda ceiling is why
       the 45-second generation budget is a UX target rather than a platform
       limit. */
    const api = new sst.aws.Function('Api', {
      handler: 'api/index.handler',
      runtime: 'nodejs22.x',
      architecture: 'arm64', // cheaper per ms than x86
      memory: '512 MB',
      timeout: '15 minutes',
      url: { cors: true },
      streaming: true,
      link: [table, anthropicApiKey, openaiApiKey, userPool, userPoolClient],
      environment: {
        VIRE_STAGE: $app.stage,
        // Provider and model are configuration, not code: switching is an env
        // change plus an eval run (PLAN §3a).
        AI_PROVIDER: 'anthropic',
        AI_MODEL: 'claude-sonnet-4-6',
      },
    });

    /* ─────────────────────────── web ───────────────────────────
       Static assets on S3 behind CloudFront. The API base URL is injected at
       build time so the same bundle can be pointed at any stage — and so the
       Capacitor build can point at prod. */
    const web = new sst.aws.StaticSite('Web', {
      build: { command: 'npm run build', output: 'dist' },
      environment: {
        VITE_API_BASE_URL: api.url,
        VITE_COGNITO_USER_POOL_ID: userPool.id,
        VITE_COGNITO_CLIENT_ID: userPoolClient.id,
        VITE_AWS_REGION: 'eu-north-1',
      },
    });

    /* ─────────────── cost tripwire (PLAN §8) ───────────────
       Everything above is free-tier, so any real charge means a
       misconfiguration. Billing metrics only exist in us-east-1. */
    if (isProd) {
      const usEast1 = new aws.Provider('UsEast1', { region: 'us-east-1' });
      new aws.cloudwatch.MetricAlarm(
        'MonthlyCost',
        {
          comparisonOperator: 'GreaterThanThreshold',
          evaluationPeriods: 1,
          metricName: 'EstimatedCharges',
          namespace: 'AWS/Billing',
          period: 21600, // 6 h — the fastest billing metrics update
          statistic: 'Maximum',
          threshold: 5,
          alarmDescription:
            'Vire estimated charges above 5 USD — expected to stay near zero on free tier.',
          dimensions: { Currency: 'USD' },
        },
        { provider: usEast1 },
      );
    }

    return {
      api: api.url,
      web: web.url,
      userPool: userPool.id,
      userPoolClient: userPoolClient.id,
      table: table.name,
    };
  },
});
