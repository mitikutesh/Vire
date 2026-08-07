# Vire — project brief

Handoff from a claude.ai prototyping session (Aug 2026). Vire is a diet + exercise
tracking app for one user in the Helsinki region, Finland. Goals: weight loss and
cholesterol control. Web app first, iOS later. Motto: "power in simplicity."

A working single-file React prototype exists at `vire-health-planner.jsx` (built as a
claude.ai artifact). It is the source of truth for UX, copy, colors, and data shapes.
The task now: plan and build the production implementation.

## What the prototype does (all working in the artifact sandbox)

- Auth flow: sign in / create account → first-run profile → plan generation gate → app
- Profile: name, age, height, weight, goal weight, sex, activity, weight-loss pace
  (250/500/750 kcal deficit), city, allergies, water goal (ml)
- Daily target: Mifflin-St Jeor × activity − pace, hard floors 1200 kcal (f) / 1500 (m)
- AI plan generation: 7 parallel Claude API calls (one per day, themed for variety),
  each returns 5 meals (kcal/protein/carbs/fat, ingredients, ≤3 steps, YouTube search
  term) + normalized shopping items; client aggregates items into a grocery list.
  Strict allergy exclusion passed in the prompt. Curated 7-day Finnish–Mediterranean
  "starter plan" ships in-file as instant option and generation fallback.
- Tabs: Now (time-aware: current meal slot by clock, live day-strip timeline, kcal
  ring, water, exercise) · Today (5 meal cards, movement, water, extras) · Week
  (7 expandable days) · Shop (grocery list)
- Logging: mark meal eaten as planned; OR log a swap ("ate something else" + kcal
  replaces that slot's planned kcal); OR "ate something extra" (adds on top).
  log.m[slot] is false | true | {n, k}.
- Shop: 5 categories, per-item live price links (s-kaupat.fi + k-ruoka.fi product
  search), manual S/K/Lidl store tags with per-store filters, Google Maps "near
  {city}" chips, chain deals pages, and an AI offer scan: on open (12h cache) a
  Claude call with web search reads the chains' public weekly offers, badges matching
  items, one tap assigns them to the discount store.
- Meal slots b/l/s/d/e with kcal budgets ≈ 22/29/10/32/7% of target.
- Water goal in ml → glasses of 250 ml (min 4).
- Exercise: static weekly rotation (EX) + quick-add chips; burned kcal offset intake.

## Prototype shims → what production needs

| Prototype (artifact sandbox)                                  | Production requirement                                                                                                                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| window.storage key-value (per Claude account)                 | Real database, per-user data                                                                                                                                               |
| Client-side "auth" (SHA-256 in browser, users in KV)          | Real auth: server-side hashing, sessions, Google OAuth, password reset                                                                                                     |
| fetch to api.anthropic.com with no key (claude.ai injects it) | Server-side proxy holding the Anthropic API key; never ship key to client                                                                                                  |
| Offer scan = Claude + web search over public offer pages      | Same as MVP via server; longer term: Kesko developer API (developer.kesko.fi, needs registered key). S-Group has NO public price API — links/AI-search remain the fallback |
| No notifications / no health data                             | Web push (PWA) is limited; HealthKit requires native iOS (or Capacitor-style wrapper) — planned for the iOS phase                                                          |
| Google button + "Forgot password" show explanatory notes      | Real implementations                                                                                                                                                       |

## Design system — LOCKED (user explicitly approved v1, rejected two alternatives)

Nordic functionalism. Mobile-first, max-w-md centered column, fixed bottom nav.

Colors:

- paper `#F1F2ED` (bg) · card `#FFFFFF` · ink `#14342B` (deep spruce) · sub `#5F6E66` · line `#DFE4DC`
- NO GREEN ACCENT — pine `#226B4F` was retired at the user's request (tokens remain
  in the prototype file, marked RETIRED, unused)
- cloud `#DD8F1F` + cloudSoft `#FAF0DC` — PRIMARY ACCENT: brand wordmark, "now"
  energy, offers, movement, progress ring/bars, checkmarks & done-states, kcal chip,
  category headers, active nav tab, focus outline
- lake `#3E7FA5` + lakeSoft `#E3EEF5` — water AND text links
- berry `#B5484D` + berrySoft — over-budget / errors / destructive confirm
- Store tag chips keep the chains' own brand colors (S green, K orange, L blue) —
  functional identification, not app accent

Rules the user enforced:

1. Primary action buttons are ink (dark spruce), never a solid accent color.
   Green-heavy buttons were explicitly rejected; then green was removed entirely.
2. No filled logo circles; brand is the plain cloudberry "Vire" wordmark (+ small
   Sprout outline icon on the auth screen only).
3. The cream-background/serif mock aesthetic was rejected — keep this system.
4. Fonts: Bricolage Grotesque (display, `.disp`) + Instrument Sans (body), Google Fonts.
5. Signature element: the live DayStrip timeline (05–23 h) — ink meal dots, a
   cloudberry move dot, cloudberry elapsed line and pulsing cloudberry "now" marker.

## Data model (from prototype — keep shapes unless there's a reason not to)

- users: { [email]: { salt, hash, created } } · session: { email }
- Per-user keys `u:<enc(email)>:` →
  - settings: { name, sex, age, h, w, goalW, act, pace, city, allergies, waterMl, target }
  - plan: { v, created, starter: bool, days: [7 × {b,l,s,d,e}], groc: [items] }
    - meal: { n, fi|null, k, p, c, f, ing[], st[]?, yt? } (snacks: no st/yt)
    - groc item: { id, cat, n, fi, q, st?: staple }
  - log:YYYY-MM-DD: { m: {slot: false|true|{n,k}}, water, ex: bool, exx[], extra[] }
  - grocery: { checked: {id:bool}, store: {id:'S'|'K'|'L'} }
  - offers: { checked: ts, deals: [{id, store, deal}], note } (12 h cache)

## Health guardrails — must survive the rewrite

- Calorie floors (1200/1500) and the Mifflin note + "sanity-check with your doctor" line
- Allergy disclaimer: generated plans exclude stated allergens, but UI must say to
  always verify product labels; the starter plan is NOT allergy-adjusted and says so
- Macros labeled as estimates
- Offer scan labeled best-effort ("AI-searched from public offer pages — verify with
  the S/K price links")

## Open questions for the planning session (ask the user before deciding)

1. Stack: framework (e.g. Next.js), DB/auth provider (e.g. Supabase / Firebase / own
   Postgres), hosting. User hasn't chosen.
2. Path to iOS: PWA first vs React Native/Capacitor from the start (HealthKit needs native).
3. Budget/keys: Anthropic API key for generation + offer scan; register for Kesko API?
4. Multi-user from day one or single-household?
5. Notifications strategy for meal/move reminders.
6. Language: UI is English with Finnish food names — Finnish localization wanted?

## Suggested first tasks

1. Read `vire-health-planner.jsx` fully.
2. Propose architecture + stack (with trade-offs), map every shim above to its real
   implementation, and draft milestones (M1: auth+DB+profile; M2: plan generation
   server-side; M3: logging views; M4: shop + offers; M5: PWA polish; M6: iOS).
3. Get the open questions answered, then scaffold the repo.
