# The E7.9 gate: does a subscribed calendar actually alert?

E7.9 (the `.ics` prep feed) is worth building only if an alarm inside a
**subscribed** calendar fires on the owner's own phone. That is not a given:
macOS Calendar strips alerts from subscriptions, Google Calendar ignores
`VALARM` on URL subscriptions, and iOS carries a per-calendar "Remove Alerts"
toggle. PLAN §5a originally claimed the feed "reaches the same lock screen",
which oversold it — this probe is how that claim gets settled with evidence
instead of confidence.

## Running it

1. Put `prep-alarm-probe.ics` somewhere your phone can reach over HTTPS. Any
   static host works; it does not need to be Vire's.
2. On iPhone: **Settings → Apps → Calendar → Accounts → Add Account → Other →
   Add Subscribed Calendar**, and paste the URL. Subscribing in Safari via a
   `webcal://` link works too.
3. Leave the defaults alone. In particular do **not** turn off "Alerts" — the
   point is to find out what happens by default, which is what a real user gets.
4. The file contains a daily event at **20:30 local** with an alarm **15 minutes
   before**, so an alert should appear at **20:15**.

## What the outcomes mean

| Result                  | What it means                               | What we do                                                                  |
| ----------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| Alert appears at 20:15  | Subscriptions alarm normally on this device | Build E7.9 as specced; it is the cheapest real notification channel         |
| Event visible, no alert | The client is stripping `VALARM`            | E7.9 becomes a _planning_ surface only, and E5.2 Web Push moves ahead of it |
| Nothing appears at all  | The subscription is not refreshing          | Check the refresh interval before concluding anything about alarms          |

Record the outcome in `docs/BACKLOG.md` under E7.9 and remove the `GATED`
marker either way. A negative result is just as useful: it is the difference
between building the right channel and building the cheap one.
