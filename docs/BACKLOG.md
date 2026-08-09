# Vire — Product Backlog

## Implementation status (updated 2026-08-09)

**Milestones M0 through M4 are complete**, plus E5.3 and E7.6. 694 unit tests and an
end-to-end test in real WebKit that walks sign-up, the profile form
and the plan gate into the shell and expands a day in the Week tab; lint,
typecheck, format and the static build are clean; one commit per story.

**Deployed to AWS prod on 2026-08-09** via the OIDC workflow, so the owner
actions below are done: the site, the Function URL and the table are live. What
is still unverified is everything that needs a _real_ provider key or a real
Cognito round-trip in a browser — a generated week, an offer scan, a Google
sign-in.

| Story                             | State      | Note                                                                                          |
| --------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| E0.1 Repo scaffold & CI/CD        | ✅ done    | CI + OIDC deploy workflow                                                                     |
| E0.2 AWS infrastructure (SST)     | ✅ done    | Deployed to prod 2026-08-09                                                                   |
| E0.3 Design tokens & typography   | ✅ done    |                                                                                               |
| E0.4 Strings & static content     | ✅ done    |                                                                                               |
| E0.5 Accessible UI kit + M0 shell | ✅ done    | I4 nesting defect fixed                                                                       |
| E0.6 Data layer & isolation tests | ✅ done    |                                                                                               |
| E0.7 Pure-logic port              | ✅ done    | Calorie floors covered                                                                        |
| E2.0 AI provider layer            | ✅ done    | Anthropic + OpenAI, contract suite                                                            |
| E1.1 Auth flows & invite-only     | ✅ done    | Port + fake tested; Cognito adapter unverified                                                |
| E1.2 Profile & settings           | ✅ done    | Target computed server-side; dialog focus-trapped                                             |
| E1.3 Google sign-in infra         | 🔒 blocked | Needs a Google Cloud OAuth client from the owner                                              |
| E2.1 Generation API               | ✅ done    | Streamed, per-day retry with backoff, 10/day limit; P95 unmeasured until deploy               |
| E2.2 Plan activation transaction  | ✅ done    | Store helper from E0.6, exercised by the generate and starter routes                          |
| E2.3 → E5.4                       | ⬜ next    | Implementable locally; see below                                                              |
| E6.1 → E6.4 (iOS)                 | 🔒 blocked | Needs Xcode, an Apple Developer account and a device/TestFlight                               |
| E7.5 Kesko API                    | ❌ closed  | Portal admits only Azure AD identities Kesko onboards — no route for an individual (PLAN §12) |
| E7.7 Prep lead times              | ⬜ planned | Owner request; AI annotates at generation time, guardrail 7                                   |
| E7.8 Head-start + evening digest  | ⬜ planned | Owns scheduling for every channel; never fires at night                                       |
| E7.9 Calendar subscription feed   | ⬜ planned | Precedes E5.2 Web Push — see PLAN §5a revision                                                |

**What is still unverified.** The OIDC bootstrap, the secrets and
`sst deploy --stage prod` are all done, and CI has deployed green twice. What
tests cannot reach is the set of acceptance criteria that need a real third
party: a Cognito sign-in in a browser, a week generated with a real provider
key, and a real offer scan. Those stay open until the owner walks them once on
the deployed site.

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
- Done: `api/routes/plan.ts` — `POST /plan/generate` (SSE), `GET /plan`,
  `POST /plan/starter`. A failed day retries once after a 1.5 s pause (seven
  parallel calls make provider overload the likeliest transient failure, and an
  instant retry would meet the same overload). A day that still fails is named in
  a `partial` event and **nothing is stored** — a week with an empty day cannot
  be followed, and the starter plan is one tap away.
- Not verified: the P95 < 45 s budget needs a real provider and a deployed
  Lambda. Measure it on the first prod generation.

### E2.2 — Plan activation transaction (M) ← review blocker #1

- AC: activating a plan is one `TransactWriteItems`: put new `PLAN#ACTIVE`,
  delete old plan's `GROCSTATE#` and `OFFERS#` items.
- AC: **regenerate ⇒ grocery checked/store state and offers cache are fresh**
  (automated test).
- Done in E0.6 as `store.activatePlan`; both E2.1 routes go through it, and
  `plan.test.ts` asserts an adopted starter plan clears the previous plan's
  checked boxes.

### E2.3 — Plan gate UI (M)

- AC: idle/generating/error states exactly as prototype, allergy-aware copy in
  idle **and** error states incl. "starter plan not adjusted for your
  allergies" (guardrail 3); 7 day-rows animate from the stream; dropped stream
  recovers by re-request (idempotent request id).
- AC: starter plan path stores STARTER + STARTER_GROC as the active plan
  (`starter: true`).
- Parity: Plan gate (all).
- Done: `src/plan/PlanGate.tsx`, plus the streaming half of the API client. The
  SSE contract lives in `src/domain/plan-stream.ts` so the route and the gate
  share one declaration — an event shape the client cannot parse is now a
  compile error in the route.
- Deviation from the AC, deliberate: **no idempotent request id.** A dropped
  stream is recovered by asking `GET /plan` before concluding failure — if the
  plan was stored just before the connection died, the client adopts it. That
  covers the failure the request id was for (paying twice for one week) with one
  cheap GET instead of server-side request bookkeeping. A drop _before_ the write
  still regenerates, which is correct.
- Beyond the AC: four distinct failure messages, because the reason changes the
  advice — bad days, a failed write, a dropped connection, and a spent daily
  allowance. And the two gates now sequence properly: no profile → setup, no plan
  → gate, both → shell, covered end to end in real WebKit.
- The shell reads the user's own plan rather than the starter fixture, so the
  hardcoded `STARTER_DAYS` / `STARTER_GROC` shim is gone from `App.tsx`.

### E2.4 — Week view + regenerate (M)

- AC: 7 expandable cards, today highlighted + auto-open, day totals, exercise
  row, weekly-average note with starter/generated wording.
- AC: regenerate in Settings keeps the two-tap berry confirm and warning copy,
  then routes through E2.2.
- Parity: Week (all except I1 trend → E3.4); Settings (regenerate).
- Done: `src/week/WeekView.tsx` and the plan section in Settings. The cards are a
  real disclosure pattern (`aria-expanded` + `aria-controls`), one open at a
  time — two open panels in a phone-width column turn the tab into a scroll hunt.
- Beyond the AC: regenerate does **not** silently replace the week. It routes to
  the plan gate with regenerate-specific copy and a "Keep my current week" way
  back, and the stored plan is left alone until a new one is activated. The
  prototype regenerated immediately, which meant a failure left the user with
  nothing; here a failure, or second thoughts, restores the existing week.
- Deliberately not auto-started: the gate could begin generating the moment it
  opens, but StrictMode double-invokes effects in development, which would spend
  two slices of the daily allowance per attempt. One tap on a screen that states
  what is about to happen is the better trade.

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
- Done: `api/routes/log.ts` (`GET`/`PUT /log/:date`), the `getLog`/`saveLog` half
  of the client port, and `src/data/` — a TanStack Query layer that profile and
  plan moved onto as well, so the app has one data idiom instead of two.
- The date is the **client's**, never the server's: a Lambda in eu-north-1 and a
  phone in Helsinki disagree for an hour twice a year, and dinner logged at 23:30
  must not land on tomorrow. The route rejects a date that is not a real day, since
  the log is stored under whatever key it is sent.
- Two bugs found and fixed while writing this, both in the optimistic path:
  `onMutate` cannot run before an await, so two taps in the same frame both
  computed from the pre-tap log and the second erased the first — the cache is now
  written synchronously in `update` and the rollback value travels with the
  mutation. And `cancelQueries` reverts a query to its pre-fetch data by default,
  which asynchronously undid the optimistic write; it now passes `revert: false`.
- Whole-document writes, not field patches. It is a handful of small fields
  belonging to one screen and one user, so last-write-wins avoids a merge protocol
  for a conflict that needs two of the user's own devices in the same second.

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
- Done: `api/routes/weight.ts` plus `src/weight/` — the entry section in Settings,
  the weekly prompt card on Now, and the trend on Week. The target is recomputed
  **server-side** on accept, floors included, and a `target` in the request body is
  ignored outright — the schema does not accept the field.
- Refinement on the AC: the second question is asked only when the new weight
  actually moves the target. Asking a question with one sensible answer is
  friction, not care, so an unchanged target saves in one tap.
- The trend plots weight on the y-axis, so a loss descends. My first version
  inverted it to make "progress go up"; that reads backwards against every other
  weight chart and the test now pins the conventional direction.
- Found while writing this: `MemoryStore.listWeights` returned the **oldest**
  `limit` entries where DynamoDB returns the newest. With more history than the
  limit the two disagree completely, so the trend would have shown the first weeks
  of history forever in dev and tests while production showed the last. Fixed, with
  a store-contract test that fails against the old behaviour.
- A new `DecimalField` was needed: `NumberField` parses with `parseInt`, and a
  weigh-in is the one place a tenth of a kilo is the whole signal.

### E3.5 — I3: History (M)

- AC: Today view gains back/forward day navigation; past days read-only;
  future days unreachable.
- AC: simple 7-day adherence summary (kcal in vs target per day) — no streaks,
  no badges.
- Done: day navigation on Today, `GET /logs`, and `AdherenceSummary` on the Week
  tab below the trend.
- The viewed day is an **offset from today**, not a date. Two things fall out for
  free: a day that starts as "today" stays today when midnight passes with the app
  open, and the future is unreachable by construction rather than by a check.
- A closed day hides its controls rather than disabling them. A disabled button
  still invites a tap; on a past day the state is simply a fact, so the movement
  card reads "Not done" instead of offering "Mark done".
- Known limitation, documented in the component: a meal marked eaten as planned is
  counted at _the current plan's_ calories for that weekday. Swaps and extras are
  exact because their calories live in the log. Regenerating mid-week therefore
  approximates older planned meals — accurate enough for a mirror, and the
  alternative is denormalising a total into every log write.
- Found while wiring it: the rollback toast was still watching today's log handle
  after the Today tab moved to a separate handle for the viewed day, so a failed
  write on a past day would have been silently swallowed. It now follows whichever
  handle failed, and the existing App test caught it.

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
- Done: `api/routes/groc.ts` and `src/shop/ShopView.tsx`. The plan-scoping
  guarantee has its own route test: state written against one plan id is gone once
  another plan is activated, which is review blocker #1 closed end to end.
- The two optimistic-write hooks (log, groceries) now share one
  `useOptimisticDoc`. Both had wanted the same behaviour, and the two subtle bugs
  found in E3.1 — the cache write having to be synchronous, and `cancelQueries`
  needing `revert: false` — now live in one place instead of being re-derivable.
- Reset empties the basket but keeps the store assignments: the store map is the
  plan for the trip, and starting the trip over is not the same as forgetting where
  things are bought.
- Beyond the AC: the store-tag button names its item and current tag, because with
  sixty rows "Assign store" alone gives a screen reader sixty identical buttons;
  the basket bar is a real `progressbar`; and the three per-chain filter strings
  collapsed into one function, since the chain label was the only difference and
  three copies is three places to drift.

### E4.2 — Area & deals links card (S)

- AC: city selector (5 options) writes back to the profile; Maps chips per
  chain in chain brand colors; three chain deals links.
- Parity: Shop (area card).
- Done: `src/shop/AreaCard.tsx`. The city writes through `saveProfile` like any
  other profile edit rather than by a shortcut route, so the server still recomputes
  the target — the city does not affect it, but a second write path that skipped
  that step would be a second place for the guardrail to be forgotten.
- The chain deals links matter more than they look: guardrail 5 calls the offer
  scan best-effort and tells the user to verify, and these are what verifying
  means. Their URLs are asserted against `CHAIN_DEALS`, and every outbound link is
  `noreferrer noopener`.

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
- Done: `api/routes/offers.ts` and `src/shop/OffersCard.tsx`.
- Everything the model returns is clamped server-side against **this plan's own
  item ids**, so a hallucinated food cannot badge something the user is not buying;
  one deal per item, at most fifteen, text truncated to 60 characters, store
  restricted to the three chains. Without that a bad scan writes nonsense into a
  cache that then survives twelve hours. `clampDeals` is exported and tested
  directly.
- The 12-hour window and the 4/day limit live in `src/domain/offers.ts`, shared by
  the route, the DynamoDB TTL and the client's auto-scan decision. The TTL used to
  restate 12 hours independently; a TTL that outlived "stale" would serve a cache
  the UI had already given up on.
- Auto-scan happens once per mount and only when the cache is stale, guarded by a
  ref — StrictMode double-invokes effects in development, and each scan costs a
  slice of the daily allowance.
- A provider without web search is reported as **501**, not 502: nothing is wrong
  with the week, the operator pointed `AI_PROVIDER_OFFERS` at an adapter that
  cannot search. A spent allowance gets its own message rather than looking like a
  failure.
- Guardrail 5 has three tests of its own: the footer names the scan as AI-searched,
  carries the time it was checked, and tells the user to verify with the price
  links; and a failure never shows stale results beside it.

---

## EPIC E5 — PWA + Trust (M5)

> As the user, Vire lives on my home screen, works in a dead spot in the
> metro, reminds me at the right moments — and my data is exportable and
> deletable.

### E5.1 — Installable PWA + offline (L)

> **Blocked on one owner input:** app icons. A PWA needs real icon assets
> (192 px, 512 px, and an iOS `apple-touch-icon`), and the brand is a wordmark
> rather than a mark — CLAUDE.md explicitly rules out a filled logo circle, so
> there is no existing shape to render at 192 px. Either supply icons or approve a
> specific treatment of the cloudberry "Vire" wordmark on paper. Everything else in
> this story is unblocked; the offline outbox in particular should be verified with
> a Playwright offline-mode test rather than by hand.

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
- Done: `api/routes/account.ts`, `src/settings/DataSection.tsx`. Format documented
  in PLAN §4a. Import was **not** pulled in — it was optional, and an importer is
  only worth writing once there is a second Vire to import into.
- Deletion order is data first, then the account. The opposite can strand items
  under a subject that can never sign in again: data nobody can reach and nobody
  can remove, which is the worst possible outcome for a deletion request. This
  order fails the recoverable way.
- A test drove that failure and caught a copy bug: the client said "Nothing was
  removed" when in fact the data was already gone. The route now returns
  `account_not_closed` for the half-done case and the UI says so, since
  `deleteUser` is idempotent and retrying finishes the job.
- Cognito deletion sits behind an `IdentityAdmin` port with an in-memory fake, so
  the ordering and confirmation logic is testable with no AWS account. The API
  Lambda gets exactly one new IAM action, scoped to this user pool.

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

---

### E7.6 — Per-user AI provider key (L) ← owner request

Users supply their own Anthropic or OpenAI key, so nobody funds anyone else's
generation.

- AC: the key lives in its own `AIKEY` item, never on the profile — the profile is
  returned to the client on every load.
- AC: **write-only.** No endpoint returns it; `GET /ai-key` answers
  `{ set, provider }`. Excluded from the I6 export, deleted with the account, never
  logged.
- AC: generation and the offer scan build a provider per request from the caller's
  key; without one they return 409 `no_ai_key` **before** spending a slice of the
  daily allowance.
- AC: without a key the app is fully usable on the starter week. The plan gate does
  not offer generation at all and says why, rather than showing a button that can
  only fail.
- AC: key field in first-run setup and in Settings (owner decision); invite-only
  stays (owner decision).
- Done. Three things worth recording:
  - **`deleteAll` used to derive its item list from `exportAll`.** Filtering the key
    out of the export would therefore have left it behind on account deletion —
    a credential nobody could reach and nobody could remove. They are now separate,
    and both directions have tests that fail if the coupling returns.
  - The plan gate has three states, not two: key, no key, and _not yet known_.
    Guessing while the status loads flashes the wrong thing at the user, and
    "add a key" shown to someone who has one is the worse guess.
  - **The owner-level `AnthropicApiKey` and `OpenaiApiKey` secrets are gone**, along
    with the env-based provider builders that read them. `SignupAllowlist` is the
    only secret left — which is also two fewer values that must be set before a
    deploy can succeed.
- Deferred: a customer-managed KMS key on the table. Retrofitting encryption onto
  an already-deployed table risks replacement, so it is a decision to take
  deliberately rather than a change to slip in (PLAN §4b).

### E7.7 — Prep lead times on generated meals (M) ← owner request

Meals that need a head start say so in the plan, so the app can answer _when to
start_ rather than only what to cook. A lunch built on dried beans is not a
noon problem, it is a 21:00-yesterday problem, and nothing in the plan currently
knows that.

- AC: `prep` is an optional array of stages on a meal —
  `{ lead: minutes before serving, active: hands-on minutes, do: string,
elastic: boolean }`.
  **Staged, not a single number**: soaking is eight hours of waiting and three
  minutes of attention, and one figure cannot say both. The user needs `lead` to
  know when to start and `active` to know whether they can fit it in.
- AC: **`elastic` is what makes the evening digest correct** (E7.8). Soaking,
  marinating and fridge-thawing can start hours earlier than ideal with no harm,
  so they can be pulled back to the previous evening. Taking a roast out to come
  to room temperature, or boiling pasta, cannot: doing those eight hours early is
  either useless or unsafe. Without this flag the scheduler has no way to tell
  "start this tonight instead" from "start this in the middle of the night",
  and would have to guess on exactly the cases where guessing wrong spoils food.
- AC: **the generator avoids meals nobody can cook.** The prompt constrains
  generated days so no meal needs a _rigid_ stage to begin between 23:00 and
  07:00, given the slot serve times. Preventing the case is better than handling
  it, and the constraint is cheap: it rules out a small tail of recipes, not a
  cuisine. If it ever collides with a day theme or the cholesterol-friendly
  constraints, the theme yields — a meal the cook has to set an alarm for at
  03:00 is not a meal this app should have suggested.
- AC: optional, so the plan schema stays `v: 1` and every stored plan already out
  there reads as "no prep needed" rather than breaking.
- AC: **the model annotates during the generation call it already makes.** No
  runtime AI, no second provider round-trip, no added latency, and the answer
  works offline forever after. A keyword table in code cannot tell dried
  chickpeas from tinned — which is the entire distinction the feature rests on —
  and the ingredient text is a Finnish/English mix that makes matching worse.
- AC: **clamped at the parse boundary**, like every other field of model output
  (`api/ai/parse.ts`): at most 3 stages, `lead` ≤ 24 h, `active` ≤ `lead`,
  `do` ≤ 60 chars. A stage that violates these is dropped; the day survives.
  Model output is untrusted input here exactly as it is everywhere else.
- AC (guardrail 7): thawing is refrigerator-only, and no fish, meat or dairy is
  held at room temperature. Prompt rule plus a standing line wherever prep is
  shown. See PLAN §7.7 for why this guardrail is different in kind from the rest.
- AC: the starter week carries hand-authored `prep` — it is curated, not
  generated, so it cannot inherit the annotations for free.
- AC: a one-shot backfill annotates the _active_ week in a single call, so nobody
  has to regenerate a week they are happy with just to gain the feature.

### E7.8 — Head-start scheduling and the evening digest (M)

The in-app surface, and the scheduling rules every delivery channel obeys.
Ships before E7.9 because it needs no delivery mechanism at all, and because it
owns the logic the calendar feed renders — there is one scheduler, not one per
channel.

**The rule that shapes the whole design (owner directive, 2026-08-09).**

A twelve-hour lead on a 12:00 lunch computes to a 00:00 start. Firing then is
worse than not firing: it wakes someone for a task they will not do, and it
teaches them to silence the app. The naive fix — clamp it forward into waking
hours — is worse still, because moving a reminder **later** means the food is
late. A 04:00 soak pushed to 07:00 is lunch at 15:00.

So the scheduler never moves a reminder later. It only ever moves it **earlier**,
and the earliest useful moment is the evening before.

**Scheduling rules, in order:**

1. `serve` comes from `DAY_STRIP.dots` (b 7.5, l 12, s 15, d 18.2, e 20.5) —
   already the app's single source of truth for when a meal lands. No second
   table to drift out of step with the DayStrip.
2. `idealStart = serve − max(stage.lead) − buffer`. Buffer defaults to 60 min
   and is settable; the owner's stated want is an hour or two of slack to move
   things around, not a just-in-time alarm.
3. If `idealStart` falls inside the **prep window** (`PREP_WINDOW`, default
   07:00–22:30, settable), it is a same-day reminder at that time. Note this is
   deliberately narrower than `SLOT_BOUNDS.dayStart` (05:00) and
   `GREETING_BOUNDS.quietUntil` — the app is willing to _greet_ you at 05:30,
   which is not the same as being willing to _wake_ you.
4. Otherwise the task moves to the **previous evening's digest** and its wording
   changes from "start now" to "before bed" — because the user is being told at
   20:30 about something whose ideal start is 00:00.
5. A task may only be pulled backwards like this if every stage involved is
   **elastic** (see E7.7): soaking, marinating and fridge-thawing are unharmed
   or improved by starting earlier. A **rigid** stage cannot be, and a meal whose
   rigid stage lands in the night is a meal the user cannot make on time.

**The evening digest is the primary channel, not a fallback.**

One predictable notification per day at a user-set time (default 20:30, after
dinner and before bed) listing everything tomorrow needs a head start on. This
is better than N scattered per-stage alarms on every axis that matters here:
it is one interruption instead of several, it arrives at a time the user has
chosen rather than one arithmetic picked, it is the same time every day so it
becomes a habit rather than a surprise, and it structurally cannot land at
04:00. Per-stage same-day reminders remain, but only for tasks that genuinely
fall inside the prep window.

This also matches the temperament the repo already commits to: it refuses
streaks and badges because "a streak turns one bad Tuesday into a reason to
give up." The same argument applies to interruptions.

- AC: Now and Today show what needs starting and by when; the digest is the
  same data rendered as one evening summary.
- AC: **never fires inside the prep window's night.** This is the acceptance
  criterion the owner asked for by name, and it holds for every channel.
- AC: **reminders move earlier, never later.** A test asserts that no computed
  time is ever after `idealStart`.
- AC: a meal needing a **rigid** start inside the night is surfaced at _plan_
  time — flagged on the Week view with an offer to swap that meal — never as a
  notification anybody could act on. Telling someone at 20:30 that they must get
  up at 03:00 is not a reminder, it is a problem to solve while they are still
  choosing the week.
- AC: **consolidated.** Tomorrow's lunch and dinner both needing a head start is
  one entry, not two.
- AC: silent once the meal is logged or swapped — reminding someone to prepare
  food they have already eaten is the fastest way to teach them to ignore it.
- AC: **breakfast is the hard case and gets its own tests.** Serving at 07:30
  means almost _any_ lead pushes it into the previous evening, so breakfast prep
  is effectively always a digest item. If that reads badly, the generator
  constraint in E7.7 is the fix, not a scheduling hack.
- AC: pure functions in `src/domain/`, unit tested. **Including both Europe/
  Helsinki DST transitions**: on the March day that has 23 hours and the October
  day that has 25, "eight hours before noon" is the case that silently breaks
  naive arithmetic, and both directions need a test.

### E7.9 — Calendar subscription feed (M)

Real lock-screen and Watch alerts with no service worker, no permission prompt
and no Home Screen install. See PLAN §5a for why this now precedes E5.2.

- AC: `GET /calendar/<token>.ics` returns `text/calendar`: one `VEVENT` per prep
  stage carrying a `VALARM`, covering the active week.
- AC: **the token is the credential.** Calendar clients cannot authenticate, so
  the URL is a long random per-user secret, revocable and reissuable from
  Settings in one tap.
- AC: the feed exposes **meal and prep times only**. Never weight, logs, targets
  or account data — the blast radius of a leaked URL stays "someone knows when I
  eat".
- AC: stable `UID`s derived from plan id + weekday + slot + stage, so a refresh
  updates events rather than duplicating them or re-firing alarms.
- AC: `REFRESH-INTERVAL` / `X-PUBLISHED-TTL` hints set to an hour. A feed for a
  reminder that is hours ahead does not need tighter polling, and the client
  picks the rate regardless.
- AC: no new AWS resource. It is one route on the Function URL already deployed,
  reading one plan item — inside the free tier at any polling rate a client will
  actually use.
- AC: Settings shows the `webcal://` link with copy-to-clipboard and a plain
  explanation of what subscribing does.
