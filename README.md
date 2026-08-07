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
role whose trust policy is scoped to this repo's `main`) is in `docs/CICD.md`;
until that bootstrap and the SST config (story E0.2) are in place, the deploy
workflow is expected to fail on the AWS step while CI stays green.

## Health guardrails

This app gives calorie and macro estimates, not medical advice. Calorie floors
(1200 kcal female / 1500 male), the Mifflin-St Jeor note, the
"sanity-check with your doctor" line, allergy label-check warnings, and the
best-effort labeling of AI-found grocery offers are **required** behaviors —
see `docs/PLAN.md` §7 before changing anything in those paths.
