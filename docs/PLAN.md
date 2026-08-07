# Vire — Production Plan (v3, verified + revised)

Product owner planning document. Source of truth for UX/copy/colors/data shapes is
`vire-health-planner.jsx`; product constraints and guardrails come from `CLAUDE.md`.

Status: **VERIFIED, REVISED PER OWNER FEEDBACK (2026-08-07)** — v1 passed
adversarial review (13 findings resolved in v2). v3 incorporates owner decisions:
**(a)** pluggable AI provider (Anthropic / OpenAI / others), not Anthropic-only;
**(b)** hosting on **AWS with the cheapest possible architecture** instead of
Vercel; **(c)** Kesko API researched — **closed to individuals**, corrected
2026-08-08 (see §12);
**(d)** Apple Health data import added (web import + native sync — see §12).
The backlog derived from this plan lives in `docs/BACKLOG.md`; every story must
trace to the prototype-parity checklist in Appendix A.

---

## 1. Product summary

Vire is a diet + exercise tracking app for one user in the Helsinki region.
Goals: weight loss and cholesterol control. Motto: "power in simplicity."
Web app first (PWA), iOS later. The working prototype defines the entire UX; the
production job is to replace the artifact-sandbox shims with real infrastructure,
harden the AI features, and add a small number of high-value improvements without
violating the simplicity principle or the locked design system.

## 2. Decisions on the open questions

| #   | Question           | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Stack              | **Vite + React SPA (TypeScript strict, Tailwind CSS v4) on S3 + CloudFront; API as a Hono app on AWS Lambda (Function URLs with response streaming); DynamoDB single-table; Cognito auth; infrastructure as code with SST v3 (CDK as fallback).**                                                                                                                                                                                                                                       | Owner chose AWS over Vercel. With no server rendering anywhere in the design, Next.js buys nothing — a Vite SPA is leaner, builds to pure static assets (S3/CloudFront and later Capacitor take it unchanged), and the app's fixed-tab navigation barely needs a router. Every AWS piece sits inside a perpetual free tier (cost table in §8). DynamoDB fits this data better than it first appears: the prototype's data is per-user documents in a KV store already. |
| 2   | Path to iOS        | **PWA first (M5), then Capacitor (M6).** Commitments that keep M6 reachable: (a) UI is a pure static SPA (holds by construction now); (b) all server calls go through an absolute, env-configured API base URL; (c) auth is token-based (Cognito JWTs), no cookies; (d) the native app ships real native value — HealthKit sync + native notifications — to clear App Store guideline 4.2.                                                                                              | Unchanged from v2; the AWS/Vite stack strengthens it (static export is no longer a constraint to defend, it's the default).                                                                                                                                                                                                                                                                                                                                            |
| 3   | AI provider & keys | **Pluggable provider layer (owner decision): a single `AiProvider` interface with adapters for Anthropic (default), OpenAI, and room for others (Gemini, Bedrock). Selected via env (`AI_PROVIDER`, `AI_MODEL`); all keys server-side in Lambda env/SSM. Kesko developer API: **closed to individuals** — the portal only accepts Azure AD identities Kesko has onboarded, so the AI offer scan plus store price links are the permanent answer, not a stopgap (corrected — see §12).** | Details in §3a. Prompts were designed and tested on Claude (prototype pins `claude-sonnet-4-6`), so Anthropic stays the default; the abstraction makes switching a config change plus an eval run, not a rewrite. Cost order-of-magnitude is similar across providers (< €5/mo single-user).                                                                                                                                                                           |
| 4   | Multi-user         | **Per-user data isolation from day one, registration closed: Cognito pre-sign-up Lambda trigger with an owner e-mail allowlist (applies to email/password AND Google sign-in).** No sharing/household features.                                                                                                                                                                                                                                                                         | Open signup would let strangers burn the owner-funded AI keys. The pre-sign-up trigger is the Cognito-native way to make the instance invite-only.                                                                                                                                                                                                                                                                                                                     |
| 5   | Notifications      | **Web Push in M5 with a full delivery design (§5a) — scheduler is EventBridge Scheduler → Lambda (replaces Vercel Cron); native notifications in the iOS phase.**                                                                                                                                                                                                                                                                                                                       | Unchanged in substance; scheduler swapped for the AWS equivalent (also free-tier).                                                                                                                                                                                                                                                                                                                                                                                     |
| 6   | Language           | **English UI with Finnish food names (as prototype). All copy centralized in one strings module from M0.**                                                                                                                                                                                                                                                                                                                                                                              | Unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

**Legacy prototype data (explicit decision):** no automated migration from the
claude.ai artifact storage; the user re-onboards (setup takes a minute). A JSON
_import_ matching the I6 export format is an optional M5 story.

## 3. Architecture (AWS, cheapest-possible)

```
Browser (PWA — Vite/React SPA, pure static)
  │  served from S3 via CloudFront (free tier: 1 TB egress/mo)
  │  Cognito auth (PKCE, JWT in client; Google via federated IdP)
  │  fetch (Bearer JWT) → API base URL (env-configured, absolute)
  ▼
AWS Lambda (Hono app, Node runtime, Function URLs)
  ├─ POST /plan/generate    → streams per-day progress (Lambda response
  │                           streaming; wait/run/done/fail events for the
  │                           PlanGate UI). Lambda timeout up to 15 min —
  │                           the Vercel maxDuration concern disappears.
  ├─ POST /plan/swap-meal   → (post-MVP, I7) one-slot regeneration
  ├─ POST /offers/scan      → provider web-search scan, 12 h cache, rate-limited
  ├─ POST /profile/target   → server-side Mifflin-St Jeor + floors
  ├─ GET  /export · POST /account/delete   (I6)
  └─ POST /health-import    → (I11) Apple Health export.xml ingestion
  │
  ▼
DynamoDB (single table, on-demand/free tier)    AI provider APIs (keys in
Cognito user pool (closed signup)                Lambda env / SSM only)
EventBridge Scheduler → Lambda notify-tick (M5 reminders)
```

Principles (unchanged from v2 unless noted):

- **Client-heavy, server-thin.** TanStack Query with optimistic updates for
  logging (tap → instant UI, background persist).
- **All AI calls server-side.** No provider key ever ships to the client.
  Lambda validates the Cognito JWT, applies per-user rate limits (generation:
  10/day; offer scan: 4/day + 12 h cache) as **DynamoDB atomic counters**
  (serverless-safe), and validates model output with Zod before returning.
- **All data access goes through the Lambda API** (single security surface,
  plain `fetch` client). DynamoDB fine-grained IAM (leading-key = user sub via
  an Identity Pool) is a known later optimization for direct client reads; not
  MVP.
- **Structured output hardening.** Provider-agnostic Zod schemas; per-day
  bounded retries; only failed days re-run.
- **Generation progress is streamed** over Lambda response streaming (Node
  streaming handler; Hono supports it). Dropped stream → client re-requests
  (idempotent per plan-request id).
- **Day boundary is client-local**; `profiles.timezone` (IANA) lets the M5
  scheduler compute the same local windows.
- **Grocery item ids are content-stable** (slug/hash of `fi`), not positional.

### 3a. AI provider layer (owner decision: not Anthropic-only)

One interface, N adapters, selected by env config:

```ts
interface AiProvider {
  generateDay(cfg: DayConfig): Promise<DayPlan>; // structured output
  swapMeal(cfg: SwapConfig): Promise<Meal>; // I7, post-MVP
  scanOffers(items: GrocItem[], city: string): Promise<OfferScan>; // needs web search
}
// config: AI_PROVIDER = anthropic | openai | bedrock | ...   AI_MODEL = <model id>
```

| Adapter                 | Generation (structured JSON)                                                              | Offer scan (needs live web search)      | Key/billing                               | Notes                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Anthropic (default)** | Messages API + structured outputs                                                         | ✅ built-in `web_search` server tool    | Anthropic API key                         | Prompts were designed/tested on Claude; prototype pins `claude-sonnet-4-6` — default stays there, with a current-model eval (e.g. Sonnet 5) as an M2 task   |
| **OpenAI (GPT)**        | Responses API + structured outputs                                                        | ✅ built-in web-search tool             | OpenAI API key                            | Full-featured alternative; needs its own prompt eval pass                                                                                                   |
| **Amazon Bedrock**      | Anthropic (and other) models via Bedrock — AWS-native IAM + one AWS bill, no separate key | ❌ no web-search server tool on Bedrock | AWS account (fits owner's AWS preference) | Viable for _generation_; the offer scan would need a search-API composition (e.g. Tavily/Brave + model) or fall back to another provider for that one route |
| Others (Gemini, …)      | Adapter slot exists; not built until wanted                                               | varies                                  | —                                         |                                                                                                                                                             |

Contract rules: every adapter returns the **same Zod-validated shapes**; the
allergy-exclusion line, slot kcal budgets, and Finnish–Mediterranean style
constraints live in shared prompt templates, with only the transport/tool syntax
per adapter. Provider/model switching = env change + running the recorded-fixture
eval suite (E2.0), never a code rewrite. Mixed mode is supported by design
(e.g. `AI_PROVIDER_OFFERS` may differ from the generation provider).

### 5a. Notification delivery design (M5)

- `PUSH#` items (endpoint, keys) + notification prefs on the profile (opt-in,
  conservative defaults).
- **EventBridge Scheduler** fires a Lambda every 15 min; it computes each
  user's local time from the profile `timezone` and applies the prototype's
  rules: meal-slot windows from `SLOT_META`, movement window 16:00–20:00,
  **skip if the slot/exercise is already logged, skip the movement reminder on
  Sunday** (`wd !== 6`). Web Push via VAPID keys stored in SSM.

## 4. Data model (DynamoDB single table)

Keep the prototype's JSON shapes (CLAUDE.md: "keep shapes unless there's a
reason not to") as document attributes — the prototype's data was per-user
KV documents, which is exactly DynamoDB's sweet spot. Validation that Postgres
CHECKs used to give (age 13–120, height 100–250, weight 30–300, pace ∈
{250,500,750}, sex ∈ {f,m}) moves into shared Zod schemas enforced in every
Lambda write path.

```
Table: vire   (PK, SK) — on-demand billing (free tier covers single-user load)

PK = USER#<cognito sub>
  SK = PROFILE               name, sex, age, h, w, goalW, act, pace, city,
                             allergies, waterMl, target (ALWAYS server-computed),
                             timezone (IANA, default Europe/Helsinki), timestamps
  SK = PLAN#ACTIVE           { v, created, starter, days[7], groc[] }
                             groc item ids = stable slug(fi); doc ≈ 15–30 KB,
                             far under the 400 KB item limit
  SK = GROCSTATE#<planId>    { checked: {id:bool}, store: {id:'S'|'K'|'L'} }
  SK = OFFERS#<planId>       { checked, deals[], note }   (12 h TTL attribute)
  SK = LOG#<YYYY-MM-DD>      { m, water, ex, exx[], extra[] }  (client-local date)
  SK = WEIGHT#<YYYY-MM-DD>   { kg }                        (improvement I1)
  SK = RL#<action>#<day>     { count }                     (atomic counters, TTL)
  SK = PUSH#<endpointHash>   { subscription }              (M5)
  SK = PREFS#NOTIFY          { reminder prefs }            (M5)
```

- **Plan activation is one `TransactWriteItems`**: put new `PLAN#ACTIVE`
  (overwriting the old), delete the old plan's `GROCSTATE#` and `OFFERS#`
  items. Acceptance criterion: **"new plan ⇒ grocery state and offers cache
  are fresh"** (was review blocker #1; the fix carries over unchanged).
- **Offers are keyed by planId** so stale deals can never badge a regenerated
  list (content-stable item ids close the remaining hole).
- **Authorization**: every Lambda handler derives `PK` from the _verified JWT
  sub_ — never from request input. Automated test: user A's token cannot read
  or write user B's items. (This replaces Postgres RLS as the isolation
  mechanism.)
- Static content (STARTER plan, EX rotation, QUICK_EX, slot metadata,
  kcal-budget ratios) stays in code — versioned product content.

## 5. Shim → production mapping (complete)

| #   | Prototype shim                                                | Production implementation                                                                                                                                                                                                                                         | Milestone |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | `window.storage` KV                                           | DynamoDB single table behind the Lambda API; TanStack Query + optimistic writes                                                                                                                                                                                   | M1–M3     |
| 2   | Client-side "auth" (SHA-256 in browser, users in KV)          | Cognito user pool: email+password (server-side hashing), email verification, PKCE token sessions; **pre-sign-up allowlist trigger (closed signup)**                                                                                                               | M1        |
| 3   | Google button shows a note                                    | Google as Cognito federated IdP (allowlist trigger still applies)                                                                                                                                                                                                 | M1        |
| 4   | "Forgot password" shows a note                                | Cognito reset flow; Cognito's built-in email (50/day cap — ample for a household) first, SES if ever needed                                                                                                                                                       | M1        |
| 5   | Client fetch to api.anthropic.com (key injected by claude.ai) | `POST /plan/generate` on Lambda via the **AiProvider layer (§3a)**; keys in Lambda env/SSM; structured output + Zod; per-day retry; streamed progress; 15-min Lambda ceiling                                                                                      | M2        |
| 6   | Offer scan client-side Claude + web search                    | `POST /offers/scan` via a **web-search-capable provider adapter** (Anthropic or OpenAI); prompt uses the profile `city` (not hardcoded Helsinki); 12 h cache keyed by plan; rate limit; deals clamped to known item ids/stores; "best-effort" label kept          | M4        |
| 7   | Kesko/S-Group pricing                                         | s-kaupat/k-ruoka product-search links (centralized module + smoke test) plus the AI offer scan — **permanently**. Neither chain exposes price data a private developer can reach: **Kesko's portal is closed to individuals (§12)** and S-Group has no public API | M4        |
| 8   | No notifications                                              | Web Push (VAPID) per §5a, EventBridge-scheduled, opt-in                                                                                                                                                                                                           | M5        |
| 9   | No health data                                                | **Two paths (owner request, §12): (a) web-phase manual import of the Apple Health `export.zip` (I11) — weights → weight log, workouts → burned kcal; (b) live HealthKit sync via Capacitor in M6**                                                                | E7 / M6   |

## 6. Improvements (PO-prioritized)

**Must (ship within MVP milestones):**

- **I1 — Weight tracking with target feedback.** Weigh-in entry (Settings +
  gentle weekly prompt), `WEIGHT#date` items, minimal trend + "current → goal"
  on the Week tab. **On weigh-in, one-tap confirm updates profile weight and
  recomputes the daily target server-side.** Trend visual uses locked tokens
  only (cloud line, ink text); caption "Trend, not medical advice." (M3)
- **I2 — Robust generation.** Structured output + Zod; retry only failed days;
  streamed per-day progress. (M2)
- **I3 — History.** Back/forward day switcher on Today (read-only past); 7-day
  adherence summary. No streaks/gamification. (M3)
- **I4 — Accessibility fixes.** No interactive element nested in another
  (prototype's `role="checkbox"` span inside a button); Settings dialog gets a
  focus trap + scroll lock. (M0, enforced from the component library up)
- **I5 — Validation & floors server-side.** Zod schemas shared client/server;
  stored `target` always server-computed with the 1200/1500 floors. (M1)
- **I6 — Data export + account deletion.** JSON export of all user data; delete
  flow cascades DynamoDB items + Cognito user. (M5)

**Should (post-MVP, E7 backlog, priority order):**

- **I7 — Swap a single meal.** One-slot regeneration honoring allergies + slot
  budget; grocery delta via stable ids; new rate-limited route.
- **I11 — Apple Health import (web).** Upload the Health app's
  `export.zip`/`export.xml`; parse **body-mass records → weight log (I1)** and
  **workouts/active energy → burned-kcal entries**. Parse client-side where
  possible (the export can be hundreds of MB; stream/filter rather than load
  whole), scope strictly to weights + workouts. Closes most of shim #9's value
  before the native app exists.
- **I8 — Water overflow.** Allow logging past goal (`9/8`), bar stays full.
- **I9 — Cholesterol log.** LDL/HDL/total entries + trend, same token +
  disclaimer rules as I1 ("discuss lipid values with your doctor").
- **I10 — Kesko API offers.** _Effectively unavailable_ (§12): the developer
  portal admits only Azure AD identities Kesko has onboarded, so there is no
  route for a private individual. Keep the item only as a record of the
  investigation — revisit if a business relationship ever exists.

**Won't (explicitly out of scope, protects simplicity):**

Barcode scanning, food-database search, social features, streaks/badges,
multi-week planning, calorie photo estimation.

## 7. Health guardrails (must survive — acceptance criteria in backlog)

1. Calorie floors 1200 (f) / 1500 (m) in `calcTarget`, client preview **and**
   server-side recompute.
2. Mifflin-St Jeor note + "sanity-check with your doctor" line in Settings.
3. Allergy handling: generated plans exclude stated allergens via prompt
   (regardless of provider — the exclusion line lives in the shared template);
   UI always says "double-check product labels"; starter plan is NOT
   allergy-adjusted and says so at both PlanGate offering points.
4. Macros labeled as estimates (Today footer).
5. Offer scan labeled best-effort with timestamp + "verify with the S/K links."
6. I1/I9/I11 health data surfaces carry "trend, not medical advice" wording;
   imported Health data is labeled with its source.

## 8. Non-functional requirements

- **Security:** AI keys server-only (Lambda env/SSM); **closed registration
  (Cognito pre-sign-up allowlist) required before M1 ships**; per-user rate
  limits (DynamoDB counters); Zod validation of all route inputs; JWT-derived
  partition keys (no user-supplied ids); email verification on; CloudFront +
  security headers; `security-review` skill before each milestone merge.
- **Privacy:** health-adjacent data → export, deletion, no analytics SDKs;
  region `eu-north-1` (Stockholm) for all AWS resources.
- **Cost (the "cheapest possible architecture" numbers):**

  | Service                  | Free tier                                        | Expected monthly cost                                           |
  | ------------------------ | ------------------------------------------------ | --------------------------------------------------------------- |
  | S3 + CloudFront          | 1 TB egress + 10 M req/mo (perpetual)            | ~€0                                                             |
  | Lambda                   | 1 M requests + 400k GB-s/mo (perpetual)          | €0                                                              |
  | DynamoDB                 | 25 GB + generous on-demand free tier (perpetual) | €0                                                              |
  | Cognito                  | free tier ≫ single-household MAU                 | €0                                                              |
  | EventBridge Scheduler    | free tier ≫ 15-min ticks                         | €0                                                              |
  | Cognito built-in email   | 50 emails/day cap                                | €0 (SES = pennies if ever needed)                               |
  | Route 53 / custom domain | —                                                | optional, ~€0.50/mo + domain; CloudFront default domain is free |
  | AI usage (any provider)  | —                                                | < €5/mo (7 gen calls ~€0.05/run; scan ~€0.05–0.15, cached 12 h) |

  **Total ≈ €0–1/mo + AI usage.** No Supabase-style free-tier _pausing_
  failure mode exists in this stack — nothing sleeps. Billing alarm at €5/mo
  as a tripwire (CloudWatch billing alert, free).

- **Performance:** app-shell JS budget **< 200 KB gzipped transfer** — the unit
  the original figure has to mean, since ReactDOM alone exceeds 200 KB
  uncompressed. Track raw size too, because parse cost is what hurts a mid-range
  phone. Measured at M0 (E0.5): **228 KB raw / 73 KB gzipped**, after moving
  domain constants out of the Zod-importing schema module so the validator stays
  server-side (that alone was ~55 KB raw). A CI bundle-budget check is part of
  the M5 polish pass (E5.4).
  Re-measured after auth (E1.1): **377 KB raw / 117 KB gzipped** — Amplify costs
  ~136 KB raw / ~44 KB gzipped, so auth alone takes over half the remaining
  gzipped budget. Two facts to keep straight: a build _without_ Cognito
  configured is only 241 KB / 77 KB, because Vite inlines the unset env vars and
  Rollup then drops the whole provider branch — so CI's figure is not
  production's. Lazy-loading would not help, since session restore runs on first
  paint. If the budget ever binds, the lever is replacing Amplify with direct
  Cognito calls and owning token refresh; that is a real cost and not worth
  paying until it binds. After the profile screen (E1.2): **442 KB raw / 132 KB
  gzipped** — two thirds of the gzipped budget spent before a single real view
  exists, so the CI check should land sooner than M5 rather than later. After the
  plan gate (E2.3): **440 KB raw / 131 KB gzipped**, and after the Week view
  (E2.4): **443 KB raw / 132 KB gzipped** — flat, because both screens are small
  and the shell stopped carrying the starter week as a fixture.
  After the log layer (E3.1): **481 KB raw / 143 KB gzipped** — TanStack Query
  costs ~38 KB raw / ~11 KB gzipped, and 71 % of the gzipped budget is now spent.
  The Now view (E3.2) added ~5 KB raw / ~1.5 KB gzipped: **486 KB / 144 KB**. The
  Today view (E3.3): **491 KB raw / 145 KB gzipped**, and weight tracking (E3.4):
  **497 KB raw / 147 KB gzipped**. End of M3, with history (E3.5): **501 KB raw /
  147 KB gzipped**; with the grocery list (E4.1): **506 KB raw / 149 KB gzipped**; end of M4 with the
  offer scan (E4.3): **512 KB raw / 150 KB gzipped** — 74 % of the gzipped budget, and the 14 KB the in-memory fake
  costs is now the cheapest thing left to reclaim.
  One lever, measured: the in-memory API is **still in the production bundle**,
  pulled in by the static import in `api/client.ts` along with the curated starter
  week (7 days plus 67 grocery rows) and Zod, even though production uses none of
  them — the server builds the starter plan and sends it over the wire. Stubbing
  that import out drops the bundle to **421 KB raw / 129 KB gzipped**, so the fake
  costs **60 KB raw / 14 KB gzipped**, more than the query library it now sits
  beside. The fix is a dynamic import in the fake branch, at the cost of an async
  `createVireApi`; do it in E5.4 with the CI budget check. Fonts
  self-hosted (Bricolage Grotesque + Instrument
  Sans via Fontsource — no Google Fonts request, no wordmark FOUT); plan
  generation P95 < 45 s with streamed per-day progress (Lambda ceiling 15 min,
  so the budget is UX-driven, not platform-driven).
- **Offline (M5):** service worker caches shell + active plan + today's log;
  iOS Safari has **no Background Sync API** — writes queue in an IndexedDB
  outbox flushed on reconnect/visibility-change (last-write-wins per field).
- **PWA acceptance:** installable on iOS home screen; airplane-mode relaunch
  shows Now/Today; a queued write survives relaunch and syncs; Lighthouse
  accessibility + performance ≥ 90 (the Lighthouse "PWA" category no longer
  exists).
- **Testing:** Vitest for pure logic (`calcTarget` floors, `aggregateItems`
  unit merging + stable ids, `slotKcal`, `getSlotKey`, day rollover); RTL for
  logging interactions; Playwright E2E (auth → first-run → starter plan → log
  a meal); **provider-adapter contract tests against recorded fixtures** (same
  fixtures run against every enabled adapter); CI on GitHub Actions.
- **CI/CD:** push to `main` deploys via `sst deploy` from GitHub Actions
  **authenticated with GitHub OIDC** — an IAM role whose trust policy is
  scoped to this repo's `main` branch; no long-lived AWS keys in GitHub.
  Single prod stage (personal project — no staging env; PR preview via
  `sst dev` locally). Full setup + workflow YAML: `docs/CICD.md`.
- **Design tokens:** locked palette + rules from CLAUDE.md as Tailwind theme
  tokens in M0; `pine` excluded (retired).

## 9. Milestones

| Milestone                | Scope                                                                                                                                                                                                                                                                                                                               | Demo criterion                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0 — Foundation**      | Vite + React + TS strict + Tailwind v4 scaffold; SST v3 project (S3/CloudFront static site, Hono Lambda, DynamoDB table, Cognito pool) deployed to `eu-north-1`; design tokens, self-hosted fonts, base UI kit (Ring, MacroChips, MealCard, DayStrip, nav shell) accessible per I4; strings module; CI (lint/typecheck/test/deploy) | App shell with locked design renders all four tabs with fixture data, served from CloudFront                                                                         |
| **M1 — Auth + profile**  | Cognito email+password (verify, reset), Google federated IdP, **pre-sign-up allowlist**, PKCE token sessions; first-run profile flow; `/profile/target` with server floors (I5)                                                                                                                                                     | Allowlisted account: create → verify → profile → target computed; non-allowlisted email rejected; data survives sign-out                                             |
| **M2 — Plan generation** | **E2.0 AiProvider layer (Anthropic default + OpenAI adapter + fixtures)**; `POST /plan/generate` (structured output, Zod, per-day retry, Lambda response streaming); PlanGate UI incl. error + starter fallback; plan-activation transaction (fresh grocery state + offers); Week view; regenerate with confirm                     | Generate a real 7-day plan with allergies respected on the default provider; flip `AI_PROVIDER` to openai and the fixture suite still passes; starter fallback works |
| **M3 — Logging**         | Now + Today live against `LOG#` items (night mode, greetings, move-window nudge, 30 s tick, DayStrip), optimistic updates, day rollover, swap/extra logging, water, exercise + quick-add, **I1 weight tracking**, **I3 history**                                                                                                    | Full day of logging on a phone; yesterday visible read-only; weigh-in recorded and target recomputed after confirm                                                   |
| **M4 — Shop + offers**   | Grocery list (stable ids), checked/store state + tag cycling, filters with counts, progress bar + reset, city selector → profile, price links, Maps chips, deals links; `/offers/scan` with auto-scan-on-open (>12 h), apply-deals, labels                                                                                          | Offer scan badges items; regenerate ⇒ grocery state and offers fresh; state persists                                                                                 |
| **M5 — PWA + trust**     | Installable PWA, offline shell + IndexedDB outbox, Web Push per §5a (EventBridge scheduler), **I6 export/delete** (+ optional JSON import), polish pass, PWA acceptance checks                                                                                                                                                      | Installed on iPhone home screen; meal reminder fires and is suppressed when already logged; works in airplane mode                                                   |
| **M6 — iOS**             | Capacitor shell over the static build (API base URL + token auth already in place), **HealthKit live sync** (workouts/active energy → burned kcal; weights → weight log), native notifications, App Store submission                                                                                                                | TestFlight build syncing HealthKit workouts into the day's burned kcal                                                                                               |

E7 items (incl. **I11 Apple Health web import**; **I10 Kesko API** is closed) are
pulled in after their milestone dependencies, per BACKLOG priority.

## 10. Risks & mitigations

| Risk                                                  | Mitigation                                                                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| LLM output invalid/slow                               | Structured output + Zod + per-day retry; starter plan one tap away; streamed progress; provider swap possible if one degrades |
| Provider lock-in / price changes                      | AiProvider abstraction + cross-provider fixture suite (E2.0) makes switching an env change                                    |
| Offer scan hallucinates deals                         | Best-effort label + timestamp + verify links; server clamps to known item ids/stores                                          |
| Stale offers after regenerate                         | Plan-keyed offers + activation transaction + stable item ids                                                                  |
| Bedrock chosen but offer scan needs web search        | Documented limitation in §3a: keep offers on Anthropic/OpenAI or compose a search API — mixed-provider config supported       |
| iOS Web Push limits (install-to-home-screen required) | Expectation copy in UI; native notifications in M6                                                                            |
| AWS misconfiguration cost surprise                    | Everything free-tier; CloudWatch billing alarm at €5; SST keeps infra reviewable as code                                      |
| Apple Health export is huge (100s of MB XML)          | I11 parses as a stream and only extracts body-mass + workouts; hard input caps                                                |
| Store search links break                              | Link builders centralized + smoke test                                                                                        |
| Owner-funded AI endpoints abused                      | Closed registration + per-user rate limits (DynamoDB counters)                                                                |
| Scope creep vs "power in simplicity"                  | Won't-list in §6; nothing new displaces the Now screen                                                                        |

## 11. Out of scope (this plan)

Finnish localization content (prepared for, not written), Android packaging,
multi-household features, any redesign — the design system is locked.

## 12. Research notes (verified 2026-08-07)

**Kesko developer API — NOT open to individuals. Corrected 2026-08-08.**

An earlier version of this plan claimed registration was "open to everyone
(verified)". **That was wrong**, and the word "verified" was unearned: the
evidence was a _Sign up_ link on a JavaScript-rendered page, read as if a link
implied a registration form.

What the page actually contains, inspected in the served HTML:
[developer.kesko.fi/signup](https://developer.kesko.fi/signup) renders exactly
one widget, `<signin-aad>` — the Azure AD (Entra ID) **sign-in** widget. Azure
API Management's own email/password registration widget (`<signup>`) is **not
present at all**, so there is no self-service registration to complete. The
page's own copy gives it away: _"Already a member or want to use Azure AD sign
in? Sign in here."_ `/apis` and `/products` likewise render only list widgets
that populate for authenticated users; anonymously they are empty.

So access needs an identity Kesko's Azure AD tenant already accepts — Kesko has
to onboard you, presumably as a supplier, retailer or partner, or invite you as
a tenant guest. There is no route for a private individual building a household
app, and no published self-serve path to ask for one.

**Consequence for the product:** the AI offer scan plus the s-kaupat and k-ruoka
price links are the **permanent** design, not an MVP stopgap. Neither Finnish
chain offers price data a private developer can reach — S-Group has no public
API either. I10 / E7.5 is therefore not "do this later" but "do this only if a
business relationship with Kesko ever exists", and the offer scan's best-effort
labelling (guardrail 5) matters more, because it is what the user relies on
permanently rather than temporarily.

**Apple Health import — possible, two ways.** A web app can never read Apple
Health directly (HealthKit is native-only). But: **(a)** the Health app's
built-in _Export All Health Data_ produces an `export.zip` containing
`export.xml`; Vire can accept that upload and extract body-mass records and
workouts (I11) — available in the web phase, no native code; **(b)** full live
sync arrives with the Capacitor HealthKit integration in M6 (shim #9). Both are
in the backlog; (a) is prioritized right after the single-meal swap in E7.

---

## Appendix A — Prototype-parity checklist

Every backlog story must trace to the items it covers. Nothing ships as "done"
while an item in its area is unimplemented (unless explicitly moved to backlog).

**Auth (M1)**

- [ ] Sign in / create account modes with inline validation messages (email format, pw ≥ 6… production: ≥ 8 + strength hint)
- [ ] Wordmark + Sprout icon on auth screen only; plain wordmark elsewhere (no filled logo circles)
- [ ] Google sign-in (real, federated), "Forgot password" (real reset email)
- [ ] Session restore on load; loading splash (wordmark on paper background)
- [ ] Sign out clears all client state

**First-run + Settings (M1)**

- [ ] Profile fields: name, age, height, weight, goal weight, sex, activity (4 levels), pace (250/500/750), city (5 options), allergies free text, water goal ml
- [ ] Live target preview (Mifflin-St Jeor × activity − pace, floors 1200/1500) + "on the way from X to Y kg" line
- [ ] First-run mode: no close button until saved; settings mode: close button
- [ ] Regenerate plan: two-tap confirm (button turns berry), replaces meals + grocery list, warning text
- [ ] Doctor note + Mifflin wording; allergy label-check warning
- [ ] Sign out button; (legacy prefill: dropped — decision §2)

**Plan gate (M2)**

- [ ] Idle state with allergy-aware copy; "Generate my week plan" (ink button) + starter-plan link (with "not adjusted for your allergies" when relevant)
- [ ] Generating state: 7 day rows with wait/run/done/fail states (streamed)
- [ ] Error state: retry + starter fallback (allergy warning repeated)
- [ ] Generated plan: 5 meals/day with kcal/macros/ingredients/≤3 steps/YouTube search term; slot budgets ≈ 22/29/10/32/7 % of target, sum within 5 %; strict allergy exclusion in prompt; grocery items normalized + aggregated (unit merging g→kg, texts, staples)

**Now (M3)**

- [ ] Greeting by hour ("Quiet hours"/morning/day/afternoon/evening) + first name + date
- [ ] Time-aware slot (b <10:30, l <14, s <16:30, d <20, e <23, night otherwise)
- [ ] Night card: "Kitchen's closed" + tomorrow's breakfast (wd+1 wraparound)
- [ ] Current-meal card: now-chip with slot hint, dish + Finnish name, macro chips, "Mark as eaten" (ink → cloud when done; shows swap kcal when swapped), swap entry ("Ate something else?"), collapsible ingredients/steps/YouTube link
- [ ] Move-window nudge card: 16–20 h, not yet done, not Sunday → links to Today
- [ ] DayStrip: 05–23 h scale, meal dots (ink) + move dot (cloud), elapsed cloud line, pulsing now-marker, letter labels, hour ticks; decorative (aria-hidden)
- [ ] Tiles: kcal ring (remaining/over states, berry when over), water tap-to-add, exercise toggle with day's rotation
- [ ] 30 s clock tick drives slot/strip updates; day rollover while open loads the new day's log

**Today (M3)**

- [ ] Summary bar (ink card): eaten/burned, remaining or "over" with flame color switch
- [ ] 5 meal cards: checkbox toggle, strikethrough when eaten, kcal chip (cloud when swapped), expand for swap + details
- [ ] Movement card: rotation exercise + mark done, quick-add chips (4), removable extra-exercise rows
- [ ] Water card: goal in glasses (ml→250 ml glasses, min 4), +/- buttons, segment bar
- [ ] "Ate something extra" card: name optional + kcal, removable rows, helper copy distinguishing swap vs extra
- [ ] Estimates disclaimer footer
- [ ] Burned kcal offset intake (rotation + quick-adds)

**Week (M2/M3)**

- [ ] 7 expandable day cards, today highlighted (ink border + badge), auto-open today
- [ ] Day header: short name tile, dinner name, day total kcal, exercise + minutes
- [ ] Expanded: all 5 slots + move row
- [ ] Weekly average note incl. starter vs generated wording
- [ ] (I1) current → goal weight + minimal trend

**Shop (M4)**

- [ ] Area card: city selector (writes back to profile), Maps chips per chain (brand colors OK), chain deals links
- [ ] Offers card (cloudSoft): auto-scan on open when cache > 12 h, manual refresh, scanning/error/results states, deals count + note, one-tap "Tag N items", best-effort label + checked timestamp
- [ ] Progress: "X of Y in the basket", bar, reset
- [ ] Filters: All/S/K/L with live counts
- [ ] Item rows: check with strikethrough, EN + FI names, quantity, staple hint, deal badge, store tag cycling – → S → K → L → –, S/K price links per item
- [ ] 5 categories in fixed order, cloud category headers

**Cross-cutting**

- [ ] Locked palette/tokens, ink primary buttons, no green accent, cloud accents per CLAUDE.md list
- [ ] Bricolage Grotesque display + Instrument Sans body (self-hosted)
- [ ] Focus-visible outlines (cloud), reduced-motion support, number-input spinners
- [ ] Mobile-first max-w-md column, fixed bottom nav (4 tabs, cloud active state)
- [ ] All health guardrails (§7)
