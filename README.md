# Vire

Diet + exercise tracking for one household in the Helsinki region. Goals: weight
loss and cholesterol control. Motto: **power in simplicity.**

Web app (PWA) first, iOS later. `vire-health-planner.jsx` is the frozen
claude.ai prototype and remains the source of truth for UX, copy, colors and
data shapes — see `CLAUDE.md` for product constraints and the locked design
system, `docs/PLAN.md` for the production plan, `docs/BACKLOG.md` for the
story-by-story backlog, and `docs/CICD.md` for the deploy pipeline.

## Quick start

```bash
npm install
cp .env.example .env      # set VITE_API_BASE_URL for local API work
npm run dev
```

## Scripts

| Script                            | What it does                                                 |
| --------------------------------- | ------------------------------------------------------------ |
| `npm run dev`                     | Vite dev server                                              |
| `npm run build`                   | Typecheck + production build to `dist/` (pure static assets) |
| `npm run preview`                 | Serve the built bundle locally                               |
| `npm run lint`                    | ESLint (flat config, typescript-eslint)                      |
| `npm run typecheck`               | `tsc -b --noEmit` across app + node configs                  |
| `npm test`                        | Vitest (watch); `npm test -- --run` for one pass             |
| `npm run test:coverage`           | Vitest with V8 coverage                                      |
| `npm run e2e`                     | Playwright end-to-end (builds + previews first)              |
| `npm run format` / `format:check` | Prettier write / verify                                      |

## Stack

- **Frontend:** Vite + React 19 + TypeScript (strict) + Tailwind CSS v4,
  built to static assets served from S3 behind CloudFront.
- **API:** Hono on AWS Lambda (Function URL with response streaming, so plan
  generation can push per-day progress).
- **Data:** DynamoDB single table. **Auth:** Cognito (invite-only via a
  pre-sign-up allowlist trigger). **Reminders:** EventBridge Scheduler.
- **AI:** pluggable provider layer — Anthropic (default), OpenAI, room for
  others; selected by env, keys server-side only. See `docs/PLAN.md` §3a.

Everything sits inside AWS perpetual free tiers (≈ €0–1/month plus AI usage);
`docs/PLAN.md` §8 has the cost table.

### Why a plain SPA and not a metaserver framework

Nothing in this app server-renders. A static SPA keeps the bundle deployable to
S3/CloudFront as-is, and lets the **same** build drop into the Capacitor iOS
shell in M6 without a second architecture. CI asserts the static build to stop
that invariant from eroding.

## TypeScript strictness

`strict` plus `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`,
`noFallthroughCasesInSwitch` and `verbatimModuleSyntax`.
`noUncheckedIndexedAccess` is deliberately **off**: the ported prototype logic
indexes fixed-length structures (7 weekdays, 5 meal slots) constantly, and the
non-null assertions it would require add noise without catching real bugs here.

## Deployment

`main` deploys to AWS through GitHub Actions using **OIDC** — no long-lived AWS
keys are stored in the repo. The one-time IAM bootstrap (identity provider +
role whose trust policy is scoped to this repo's `main`) is in `docs/CICD.md`.

Infrastructure is declared in `sst.config.ts` (region `eu-north-1`): DynamoDB
table, Cognito user pool with an invite-only pre-sign-up trigger, the Hono API
on Lambda with a streaming Function URL, the static site on S3 + CloudFront, and
a €5 billing alarm as a tripwire — everything else is free-tier.

Before the first deploy, set the secrets (they land in SSM, never in GitHub):

```bash
npx sst secret set SignupAllowlist "you@example.com" --stage prod
npx sst secret set AnthropicApiKey "sk-ant-..."      --stage prod
npx sst secret set OpenaiApiKey    "sk-..."          --stage prod   # optional
npx sst deploy --stage prod
```

## Inviting someone

Registration is invite-only, and _where_ the allowlist lives depends on how the
app is running.

**Deployed (Cognito).** The Cognito pre-sign-up trigger reads the
`SignupAllowlist` secret, so inviting someone is one command — no redeploy:

```bash
npx sst secret set SignupAllowlist "you@example.com,partner@example.com" --stage prod
# or a whole domain:
npx sst secret set SignupAllowlist "@example.com" --stage prod
```

It **fails closed**: an unset or empty allowlist rejects every registration,
because failing open would mean an open sign-up endpoint attached to a paid AI
key. A refused address is told the instance is invite-only, rather than being
left to guess at a wrong password.

**Local `npm run dev` (in-memory fake).** There is no allowlist by default —
**any** email address may register, because the allowlist exists to protect a
real AI budget and there is none behind the fake. Accounts live in the browser
tab and disappear on reload. To exercise the invite-only path locally, set
`VITE_DEV_ALLOWLIST` in `.env` (see `.env.example`).

**Google sign-in is not available yet** and the button is therefore hidden. It
needs a Cognito hosted-UI domain, a Google identity provider on the pool, and
registered callback URLs — none of which exist (backlog E1.3). Email and
password is the working path.

Until that bootstrap has run, the deploy workflow is expected to fail on the AWS
step while CI stays green. `api/sst-env.d.ts` is a hand-written stand-in for the
resource typings SST generates on first deploy; delete it once the generated
`sst-env.d.ts` exists.

## Health guardrails

This app gives calorie and macro estimates, not medical advice. Calorie floors
(1200 kcal female / 1500 male), the Mifflin-St Jeor note, the
"sanity-check with your doctor" line, allergy label-check warnings, and the
best-effort labeling of AI-found grocery offers are **required** behaviors —
see `docs/PLAN.md` §7 before changing anything in those paths.
