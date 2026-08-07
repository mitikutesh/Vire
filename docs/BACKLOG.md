# Vire — Product Backlog

## Implementation status (updated 2026-08-07)

**Milestone M0 is complete**, plus the AI provider layer from M2 and both M1
stories. 311 unit tests and an end-to-end onboarding test in real WebKit; lint,
typecheck, format and the static build are clean; one commit per story.

| Story                             | State      | Note                                                            |
| --------------------------------- | ---------- | --------------------------------------------------------------- |
| E0.1 Repo scaffold & CI/CD        | ✅ done    | CI + OIDC deploy workflow                                       |
| E0.2 AWS infrastructure (SST)     | ✅ done    | Declared, **not yet deployed**                                  |
| E0.3 Design tokens & typography   | ✅ done    |                                                                 |
| E0.4 Strings & static content     | ✅ done    |                                                                 |
| E0.5 Accessible UI kit + M0 shell | ✅ done    | I4 nesting defect fixed                                         |
| E0.6 Data layer & isolation tests | ✅ done    |                                                                 |
| E0.7 Pure-logic port              | ✅ done    | Calorie floors covered                                          |
| E2.0 AI provider layer            | ✅ done    | Anthropic + OpenAI, contract suite                              |
| E1.1 Auth flows & invite-only     | ✅ done    | Port + fake tested; Cognito adapter unverified                  |
| E1.2 Profile & settings           | ✅ done    | Target computed server-side; dialog focus-trapped               |
| E1.3 Google sign-in infra         | 🔒 blocked | Needs a Google Cloud OAuth client from the owner                |
| E2.1 → E5.4                       | ⬜ next    | Implementable locally; see below                                |
| E6.1 → E6.4 (iOS)                 | 🔒 blocked | Needs Xcode, an Apple Developer account and a device/TestFlight |
| E7.5 Kesko API                    | 🔒 blocked | Needs the owner to register at developer.kesko.fi               |

**Owner actions that unblock end-to-end verification.** Everything above is
verified by unit and component tests only — nothing has run against AWS. To get
past that: run the one-time OIDC bootstrap in `docs/CICD.md`, set the three
secrets listed in the README, then `npx sst deploy --stage prod`. Until then the
auth, generation and offer-scan stories can be written and unit-tested but their
end-to-end acceptance criteria (a real Cognito sign-in, a real generated week, a
real offer scan) cannot be checked.

---

Derived from `docs/PLAN.md` (v3: AWS architecture, pluggable AI provider,
verified Kesko/Apple Health research). One epic per milestone + a post-MVP
epic. Every story lists acceptance criteria (AC) and tasks; **Parity**
references point to Appendix A of PLAN.md — a story is not done while its
parity items are open. Sizing: S (≤ ½ day), M (≈ 1–2 days), L (≈ 3–5 days)
for a single developer.

Priority order: E0 → E1 → E2 → E3 → E4 → E5 → E6; E7 items are pulled in only
when everything before them in their milestone is done.

---

## EPIC E0 — Foundation (M0)

> As the developer, I need a scaffolded, CI-guarded codebase on the cheapest
> possible AWS architecture with the locked design system baked in, so every
> later feature is built on the right rails.

### E0.1 — Repo scaffold & CI/CD (M)

Vite + React + TypeScript strict, Tailwind CSS v4, ESLint + Prettier, Vitest,
RTL, Playwright, GitHub Actions per **`docs/CICD.md`**: `ci.yml`
(lint/typecheck/unit/build on every PR and push) + `deploy.yml` (main only).

- AC: fresh clone → `npm i && npm run dev` works; CI red on type or lint error.
- AC: **push to `main` deploys to AWS via GitHub OIDC** — `id-token: write`,
  `aws-actions/configure-aws-credentials` with `role-to-assume`; **zero
  long-lived AWS keys in GitHub secrets**; deploys serialized via a
  `concurrency` group; tests gate the deploy.
- AC: the app is a pure static SPA (no server rendering anywhere) — verified by
  a CI build step; this keeps M6 (Capacitor) reachable.
- Tasks: scaffold; strict tsconfig; ci.yml + deploy.yml from docs/CICD.md;
  README.

### E0.2 — AWS infrastructure as code (M)

SST v3 project (CDK fallback) in `eu-north-1`.

- AC: one `sst deploy` provisions: S3 + CloudFront static site, Hono Lambda
  (Node, Function URL with response streaming enabled), DynamoDB table
  (PK/SK, on-demand, TTL attribute), Cognito user pool + app client, secrets
  in SSM (AI keys, VAPID later).
- AC: CloudWatch **billing alarm at €5/mo**; all resources tagged; teardown
  (`sst remove`) leaves nothing billing.
- AC: API reachable at an absolute base URL injected into the SPA at build
  time (env), not hardcoded (M6 requirement).
- AC: one-time OIDC bootstrap done per `docs/CICD.md` §1: GitHub OIDC identity
  provider + `vire-github-deploy` IAM role whose trust policy is scoped to
  `repo:<owner>/<repo>:ref:refs/heads/main`; role ARN + region stored as
  GitHub Actions **variables** (not secrets — the trust policy is the gate).
- Hardening task (non-blocking): replace `AdministratorAccess` on the deploy
  role with a policy scoped to the services SST actually manages.

### E0.3 — Design tokens & typography (S)

- AC: full palette from CLAUDE.md as Tailwind theme tokens; `pine` absent
  (retired); store-chain brand colors namespaced as functional tags.
- AC: Bricolage Grotesque (display) + Instrument Sans (body) **self-hosted**
  (Fontsource) — no Google Fonts request, no wordmark FOUT; `.disp` utility.
- AC: focus-visible outline (cloud), reduced-motion media rule ported.
- Parity: Cross-cutting.

### E0.4 — Strings module (S)

- AC: all user-facing copy in one typed module (English, Finnish food names
  inline); components contain no literal copy (decision #6 insurance).

### E0.5 — Base UI kit, accessible (L)

Port from prototype as typed, tested components: Ring, MacroChips, MealDetails,
MealCard, CustomEat, DayStrip, DetailsToggle, Field/inputs, bottom nav, shell.

- AC (I4): meal-card checkbox is a real `<button role="checkbox">` **sibling**
  of the expand control — no interactive nesting; keyboard operable.
- AC: DayStrip visually identical to prototype (dots, elapsed line, pulse,
  ticks).
- AC: all four tabs render with fixture data (starter plan) behind a dev flag.
- Parity: Cross-cutting; Now (DayStrip); Today (meal cards).

### E0.6 — Data layer & authorization tests (M)

Single-table access module over DynamoDB (PLAN §4) with shared Zod schemas.

- AC: every write path validates with the shared Zod schemas (age 13–120,
  height 100–250, weight 30–300, pace ∈ {250,500,750}, sex ∈ {f,m}, …).
- AC: partition key is always derived from the **verified JWT sub** — never
  from request input; automated test proves user A's token cannot read/write
  user B's items (replaces RLS).
- AC: plan-activation `TransactWriteItems` helper exists (used by E2.2).

### E0.7 — Pure-logic port with tests (M)

`calcTarget` (floors!), `getSlotKey`, `greetFor`, `slotKcal`, `dateKey`/
`weekdayIdx`, `aggregateItems` (+ **content-stable item ids**: slug of `fi`),
link builders (s-kaupat, k-ruoka, YouTube, Maps) in one module.

- AC: Vitest coverage of floors (f/m), slot boundaries (10:30/14/16:30/20/23),
  unit merging (g→kg, mixed text quantities), id stability across regeneration.
- AC: link-builder smoke test (URL shape).
- Parity: Plan gate (aggregation); guardrail 1.

---

## EPIC E1 — Auth + Profile (M1)

> As the user, I sign in securely (email or Google), tell Vire about myself
> once, and get a medically-floored daily calorie target — with nobody else
> able to register on my instance or read my data.

### E1.1 — Closed registration & auth flows (L)

- AC: **Cognito pre-sign-up Lambda trigger enforces an owner e-mail allowlist**
  — applies to email/password sign-up AND first Google sign-in; a
  non-allowlisted email gets a clear "invite only" message.
- AC: email+password sign-up with verification email (Cognito built-in email;
  50/day cap is ample); sign-in; sign-out clears all client state; session
  restore on load with wordmark splash; PKCE token handling.
- AC: password minimum 8 chars with helper text (raised from prototype's 6).
- AC: Google sign-in works end-to-end as a Cognito federated IdP (shim #3).
- AC: "Forgot password" completes via Cognito reset flow (shim #4).
- AC: auth screen shows Sprout icon + cloudberry wordmark; primary button ink.
- Tasks: Google OAuth client + IdP config, pre-sign-up trigger, auth screens
  (custom UI over the Cognito SDK — no hosted-UI look), E2E happy path.
- Parity: Auth (all).

### E1.3 — Google sign-in infrastructure (M)

Discovered during the E1.1 review: the button was rendered with nothing behind
it. It is now hidden until this story lands, because a button that silently does
nothing is worse than no button.

- AC: a Cognito hosted-UI domain exists, a Google identity provider is declared
  on the pool, and the app client registers the callback and sign-out URLs.
- AC: `VITE_COGNITO_OAUTH_DOMAIN` is injected by SST, which is what makes
  `googleSignInAvailable()` true and reveals the button.
- AC: the pre-sign-up allowlist still gates federated first sign-in (already
  covered by a test — Google must not be a way around the invite gate).
- **Owner action first:** create an OAuth client in Google Cloud and store the
  client id and secret as SST secrets.
- AC: `AuthUser.email` after a Google sign-in is a real address, not the
  generated `cognito:username`.

### E1.2 — First-run profile & settings (L)

- AC: all profile fields with the prototype's options and layout; live target
  preview with floors; "on the way from X to Y kg" line.
- AC: first-run has no close/skip until saved; afterwards Settings opens from
  the header gear as a **focus-trapped dialog with scroll lock** (I4).
- AC: doctor note + Mifflin wording and allergy label-check warning present
  (guardrails 2, 3).
- AC (I5): saving calls `POST /profile/target`; stored `target` is
  server-computed; out-of-range values rejected with inline errors.
- AC: profile stores IANA `timezone` (default Europe/Helsinki) for M5.
- Parity: First-run + Settings (all except regenerate → E2.4).

---

## EPIC E2 — AI Plan Generation (M2)

> As the user, I tap once and get a 7-day cholesterol-friendly Finnish–
> Mediterranean plan that respects my allergies and calorie budget — from
> whichever AI provider is configured — or fall back to the starter plan.

### E2.0 — AI provider layer (M) ← owner decision: not Anthropic-only

- AC: `AiProvider` interface (`generateDay`, `swapMeal`, `scanOffers`) with
  **Anthropic adapter (default)** and **OpenAI adapter**; selected via
  `AI_PROVIDER` + `AI_MODEL` env (SSM); `AI_PROVIDER_OFFERS` may differ.
- AC: shared prompt templates (allergy-exclusion line, slot budgets, style
  constraints) — only transport/tool syntax lives in adapters; every adapter
  returns the same Zod-validated shapes.
- AC: **contract-test fixture suite** runs against every enabled adapter in CI
  (recorded fixtures; live smoke test behind a flag).
- AC: Bedrock documented as a generation-only option (no web-search tool —
  offers need Anthropic/OpenAI or a search-API composition); adapter slot
  stubbed, not built.
- AC: default model = prototype's `claude-sonnet-4-6`; a current-model eval
  (e.g. Sonnet 5) is a recorded task in this story.

### E2.1 — Generation API (L)

`POST /plan/generate` on Lambda (server keys; shim #5).

- AC: 7 themed day-calls in parallel (prototype THEMES + slot budgets
  22/29/10/32/7 %, sum within 5 % of target); strict allergy exclusion.
- AC (I2): structured output via the provider layer, Zod-validated; a failed
  day retries alone (bounded); response streams `{day, state}` events over
  **Lambda response streaming** (wait/run/done/fail).
- AC: Lambda timeout set generously (≤ 15-min platform ceiling); P95 < 45 s
  budget is UX-driven and measured.
- AC: rate limit 10/day/user via DynamoDB atomic counter; JWT required.
- AC: grocery items aggregated server-side with content-stable ids.
- Tasks: route, prompt port, schema, streaming, retries, rate limiting, unit
  tests with fixtures.

### E2.2 — Plan activation transaction (M) ← review blocker #1

- AC: activating a plan is one `TransactWriteItems`: put new `PLAN#ACTIVE`,
  delete old plan's `GROCSTATE#` and `OFFERS#` items.
- AC: **regenerate ⇒ grocery checked/store state and offers cache are fresh**
  (automated test).

### E2.3 — Plan gate UI (M)

- AC: idle/generating/error states exactly as prototype, allergy-aware copy in
  idle **and** error states incl. "starter plan not adjusted for your
  allergies" (guardrail 3); 7 day-rows animate from the stream; dropped stream
  recovers by re-request (idempotent request id).
- AC: starter plan path stores STARTER + STARTER_GROC as the active plan
  (`starter: true`).
- Parity: Plan gate (all).

### E2.4 — Week view + regenerate (M)

- AC: 7 expandable cards, today highlighted + auto-open, day totals, exercise
  row, weekly-average note with starter/generated wording.
- AC: regenerate in Settings keeps the two-tap berry confirm and warning copy,
  then routes through E2.2.
- Parity: Week (all except I1 trend → E3.4); Settings (regenerate).

---

## EPIC E3 — Daily Logging (M3)

> As the user, I open Vire at any moment and it tells me what's now — and lets
> me log meals, swaps, extras, water, movement and my weekly weigh-in in a
> couple of taps, even on a spotty connection.

### E3.1 — Daily log persistence & rollover (M)

- AC: `LOG#<date>` item per client-local date; TanStack Query optimistic
  updates (instant tap, background persist, rollback + toast on error).
- AC: day rollover while open swaps to the new day's log; 30 s clock tick
  drives slot/DayStrip updates.
- AC: `log.m[slot]` union (`false | true | {n,k}`) modeled as a discriminated
  TS type; `slotKcal` semantics preserved.

### E3.2 — Now view (L)

- AC: greeting by hour incl. "Quiet hours"; night card with tomorrow's
  breakfast (Sunday → Monday wraparound); current-meal card with now-chip,
  Finnish name, macro chips, mark-as-eaten (ink → cloud, swap-aware label),
  swap entry, collapsible details with YouTube link.
- AC: move-window nudge only 16–20 h, not done, not Sunday; links to Today.
- AC: tiles — kcal ring (berry + "+N over" when over), water tap-to-add,
  exercise toggle with the day's rotation entry.
- Parity: Now (all).

### E3.3 — Today view (L)

- AC: summary bar (eaten/burned/remaining incl. over-state), 5 meal cards with
  toggle/strikethrough/swap, movement card with rotation + quick-add chips +
  removable rows, water card (+/-, segment bar, goal from ml, min 4 glasses),
  extras card with helper copy, estimates disclaimer footer (guardrail 4);
  burned kcal offsets intake.
- Parity: Today (all).

### E3.4 — I1: Weight tracking with target feedback (M)

- AC: weigh-in entry from Settings + a gentle weekly prompt (card, not a nag);
  one `WEIGHT#<date>` item per date (upsert).
- AC: after a weigh-in, one-tap confirm updates profile weight and recomputes
  the target **server-side**; declining leaves the target untouched.
- AC: Week tab shows "current → goal" and a minimal trend — cloud line on
  card, ink text, no new colors; caption "Trend, not medical advice."
  (guardrail 6).

### E3.5 — I3: History (M)

- AC: Today view gains back/forward day navigation; past days read-only;
  future days unreachable.
- AC: simple 7-day adherence summary (kcal in vs target per day) — no streaks,
  no badges.

---

## EPIC E4 — Shop + Offers (M4)

> As the user, I get the week's grocery list organized by category, check
> things off as I shop, split items between S/K/Lidl, and see best-effort
> AI-found offers — with live price links to verify.

### E4.1 — Grocery list & state (L)

- AC: list renders from the active plan's `groc` (stable ids) in the 5 fixed
  categories with cloud headers; EN + FI names, quantity, staple hint.
- AC: check with strikethrough; progress "X of Y in the basket" + bar + reset;
  store tag cycling `– → S → K → L → –`; filters All/S/K/L with live counts;
  per-item S/K price links.
- AC: state lives in `GROCSTATE#<planId>`; fresh after regenerate (E2.2 test).
- Parity: Shop (list, progress, filters, tags, links).

### E4.2 — Area & deals links card (S)

- AC: city selector (5 options) writes back to the profile; Maps chips per
  chain in chain brand colors; three chain deals links.
- Parity: Shop (area card).

### E4.3 — Offer scan server-side (L)

`POST /offers/scan` (shim #6), via the provider layer.

- AC: **runs on a web-search-capable adapter** (Anthropic or OpenAI —
  `AI_PROVIDER_OFFERS`); prompt uses the profile `city`, not hardcoded
  Helsinki; server clamps deals to known item ids + S/K/L; ≤ 15 deals, deal
  text ≤ 60 chars.
- AC: result cached in `OFFERS#<planId>` with 12 h TTL; auto-scan on Shop open
  only when stale; manual refresh; rate limit 4/day/user.
- AC: UI states (first scan vs refresh, error + retry, results with count +
  note), one-tap "Tag N items", best-effort label with timestamp + "verify
  with the S/K price links" (guardrail 5).
- Parity: Shop (offers card).

---

## EPIC E5 — PWA + Trust (M5)

> As the user, Vire lives on my home screen, works in a dead spot in the
> metro, reminds me at the right moments — and my data is exportable and
> deletable.

### E5.1 — Installable PWA + offline (L)

- AC: manifest + service worker; installable on iOS home screen; shell +
  active plan + today's log cached; airplane-mode relaunch shows Now/Today.
- AC: log writes queue in an IndexedDB outbox flushed on reconnect/visibility
  (no Background Sync on iOS); queued write survives relaunch; last-write-wins
  per field.
- AC: Lighthouse accessibility + performance ≥ 90.

### E5.2 — Web Push reminders (L)

Per PLAN §5a.

- AC: opt-in UI (default off); `PUSH#` subscription items + `PREFS#NOTIFY`;
  VAPID keys in SSM.
- AC: **EventBridge Scheduler → Lambda every 15 min**: computes user-local
  time from the profile `timezone`; meal reminders within slot windows;
  movement reminder in the 16–20 h window; **suppressed when already logged;
  movement reminder skipped on Sunday**.
- AC: iOS expectation copy ("install to home screen to receive reminders").

### E5.3 — I6: Export & delete (M)

- AC: `GET /export` returns all user data as one JSON file (documented
  format); `POST /account/delete` requires typed confirmation, deletes all
  DynamoDB items + the Cognito user, signs out.
- AC (optional pull-in): JSON import matching the export format; legacy
  artifact data is NOT migrated (decision PLAN §2).

### E5.4 — Polish pass (M)

- AC: parity checklist (PLAN Appendix A) fully green or explicitly deferred;
  visual diff against prototype on all tabs + auth + settings; copy proofread
  from the strings module; `ui-ux-a11y` + `security-review` audits pass.

---

## EPIC E6 — iOS (M6)

> As the user, Vire is a real iPhone app: my workouts flow in from HealthKit
> and reminders are native.

### E6.1 — Capacitor shell (L)

- AC: the static Vite build loads in a Capacitor iOS project; API calls hit
  the env-configured base URL; Cognito token auth works in the WKWebView shell
  (no cookies — committed since M0/M1).
- AC: app icon/splash from the wordmark rules (no filled logo circles).

### E6.2 — HealthKit live sync (L)

- AC: with permission, workouts/active energy sync into the day's burned kcal
  (merge/dedupe rule vs manual quick-adds documented — incl. entries that came
  from an earlier I11 web import); body-mass samples optionally feed the
  weight log (I1) behind the same one-tap target-recompute confirm; shim #9
  fully closed.

### E6.3 — Native notifications (M)

- AC: native local notifications replace Web Push inside the app, same §5a
  rules.

### E6.4 — App Store submission (M)

- AC: TestFlight build distributed; store listing; guideline 4.2 case made by
  HealthKit + native notifications; privacy nutrition label matches reality
  (no analytics SDKs).

---

## EPIC E7 — Post-MVP improvements (backlog, priority order)

| #    | Item                                                                                                                                                                                                                                                                                           | Size | Notes                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| E7.1 | **I7 Swap a single meal** — one-slot regeneration honoring allergies + slot budget; grocery delta via stable ids; two-tap confirm; new rate-limited route `POST /plan/swap-meal`                                                                                                               | M    | Highest-value small feature                                                                         |
| E7.2 | **I11 Apple Health import (web)** — upload `export.zip`/`export.xml` from the Health app; stream-parse ONLY body-mass records → weight log (I1) and workouts/active energy → burned-kcal entries; hard input caps (file can be 100s of MB); imported entries labeled with source (guardrail 6) | M    | Owner request; delivers most of shim #9's value before M6; superseded-not-removed by E6.2 live sync |
| E7.3 | **I8 Water overflow** — allow logging past goal, display `9/8`, bar stays full                                                                                                                                                                                                                 | S    | Removes prototype's `Math.min` cap                                                                  |
| E7.4 | **I9 Cholesterol log** — LDL/HDL/total entries + trend, same token + disclaimer rules as I1                                                                                                                                                                                                    | M    | Serves product goal #2                                                                              |
| E7.5 | **I10 Kesko API offers** — registration is OPEN to everyone (verified, PLAN §12): task 1 = register a free key at developer.kesko.fi and verify the grocery product/price data scope + quotas; task 2 = real K-chain prices for matched items; AI scan remains for S/Lidl                      | L    | Registration no longer a blocker — do task 1 early, cheap                                           |
| E7.6 | **Finnish localization** — translate the strings module                                                                                                                                                                                                                                        | M    | Open decision #6; no refactor needed thanks to E0.4                                                 |

**Won't-do (protects "power in simplicity"):** barcode scanning, food-database
search, social features, streaks/badges, multi-week planning, photo calorie
estimation.

---

## Decisions confirmed by the owner (2026-08-07)

1. **AI provider: pluggable** (Anthropic default, OpenAI adapter, others
   possible incl. Bedrock-for-generation) — PLAN §3a.
2. **Hosting: AWS, cheapest possible** — S3/CloudFront + Lambda + DynamoDB +
   Cognito + EventBridge, all inside perpetual free tiers (~€0–1/mo + AI);
   Vercel and Supabase dropped — PLAN §3, §8.
3. **Kesko API**: open self-service registration confirmed; verify data scope
   after registering (E7.5).
4. **Apple Health import**: yes — web import of the Health export file (E7.2)
   now, live HealthKit sync in M6 (E6.2).

## Decisions still open for confirmation (PO made the call; cheap to reverse)

1. iOS via PWA → Capacitor, not React Native (PLAN §2.2)
2. Closed registration / invite-only allowlist (PLAN §2.4)
3. No migration of prototype data — re-onboard (PLAN §2)
4. Password minimum raised to 8 chars (E1.1)
5. Default generation model stays on the prototype's `claude-sonnet-4-6` until
   the E2.0 eval task compares current models
