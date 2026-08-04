# Live Floor Scoreboard — Architecture Plan

Goal: the TVs above the Medicare Inbound floor show live-updating scoreboards (today's
production, leaderboards, daily recap) instead of static JPGs, using the PosterBooking
signage we already run, with numbers pulled from Onyx.

---

## The constraint that shapes everything

PosterBooking's "Website / URL" app can point a TV at any public URL — that part is easy.
The hard part is how a hosted page gets Onyx data:

| Path | Verdict |
|---|---|
| **Onyx External Analytics API** (server pulls directly) | ❌ Not viable alone. It's **alpha** ("may be turned off at any time"), daily granularity only, **1 request per 10 min** per endpoint, 8-day max window, days bucketed on Hawaii time. No intraday numbers, and no raw policy fields for our Core/STHHC/HI classification rules. |
| **Onyx MCP SQL** (what our Claude reports use) | ✅ Rich, live, has every field — but it's tied to a Claude session's connector auth. A Railway server can't call it. Usable from a **scheduled Claude Routine** that pushes results out. |
| **Onyx webhooks** (`POLICY_CREATED` / `POLICY_UPDATED`, `CALL_ENDED`) | ✅ Real-time push, HMAC-SHA256 signed, carries carrier / policy name / type / status / agent / premium — everything the classification ladder needs. Retried only 3× and retained 10 days, so it needs a reconciliation backstop. |

**Conclusion: push architecture.** A small always-on web app on Railway is the display +
aggregation layer. Data arrives two ways: a scheduled Claude Routine pushing verified
snapshots (the source of truth), and Onyx webhooks nudging today's counts in real time.

---

## Architecture

```
                ┌─────────────────────────────┐
 Onyx MCP SQL ──► Claude Routine (cron,        │  POST /ingest (bearer secret)
                │ every 10–15 min, floor hrs)  ├──────────────┐
                └─────────────────────────────┘              ▼
                                                   ┌───────────────────┐
                ┌─────────────────────────────┐    │  Railway app       │
 Onyx webhooks ─► POLICY_CREATED / UPDATED ────────►  /webhooks/onyx    │
                │ (HMAC verified)              │    │  (Node/Express)   │
                └─────────────────────────────┘    │                   │
                                                   │  SQLite snapshot  │
                                                   │  + live counters  │
                                                   └────────┬──────────┘
                                                            │ GET /board/*  (HTML)
                                                            │ GET /api/stats (JSON)
                                                            ▼
                                              PosterBooking "Website" app → TVs
```

### Railway app (single Node/Express service)

- **`GET /board/live`** — today's running board: policies by product (Core / STHHC / HI /
  Ancillary / Total), inbound calls, conversion, today's leaders, selling days left.
- **`GET /board/daily`** — yesterday's recap board (the current floor_board layout).
- **`GET /board/leaders/:product`** — month-to-date leaderboard (the current leaderboard layout).
- **`GET /board/rotation`** — cycles through the boards on a timer, so PosterBooking only
  needs **one URL** per TV.
- **`GET /api/stats`** — JSON the board pages poll every 30–60 s, updating the DOM in place.
  No full page reload → no white flash on the TVs.
- **`POST /ingest`** — bearer-secret-protected; receives snapshot JSON from the Routine.
- **`POST /webhooks/onyx`** — verifies `X-Onyx-Signature-256`, classifies the policy
  (ported classification ladder), bumps today's live counters.
- Storage: SQLite on a Railway volume (last-good snapshot survives restarts; TVs never
  show an empty board).
- Every board carries an **"as of HH:MM"** stamp and a visible stale badge if the last
  snapshot is older than ~30 min — a wrong-looking number on the wall is worse than none.

### Data path 1 — scheduled Claude Routine (source of truth)

A cron Routine in this Claude environment (e.g. every 15 min, 8am–7pm ET weekdays) runs the
same Onyx MCP SQL our TV-board reports already use — with all the house rules:

- HRA rows stripped (3-part match on policy_type + carrier_name + policy_name)
- **STHHC classifies before HI** (GTL STHHC arrives keyed as hospital_indemnity)
- `ma_only` counts as Core
- Roster scoping to worker profile 507; explicit floor-vs-department choice
- "Yesterday" = last **selling day**, verified against call data

It POSTs a snapshot to `/ingest`. Even if webhooks are down, boards are never more than
one cycle stale.

### Data path 2 — Onyx webhooks (liveness)

`POLICY_CREATED` / `POLICY_UPDATED` → counts move within seconds of a sale being keyed.
Live counters are **overwritten by every Routine snapshot**, so webhook misses (3-retry
limit) self-heal within 15 min. Optionally add `CALL_ENDED` later for a live calls/
conversion tile.

### Display / design

Reuse the existing board design system verbatim (deep-navy field, Barlow Condensed +
Inter, header bar → content + right rail → green ask band, `vh/vw` + `clamp()` sizing,
`overflow:hidden`). The two existing HTML boards become templates rendered from
`/api/stats` data instead of hard-coded numbers.

### Security

The page will carry agent names + production, and PosterBooking players can't log in, so:
unguessable token in the URL (`/board/live?key=…`), checked server-side; ingest bearer
secret; webhook HMAC + endpoint bearer token; all secrets in Railway env vars. Not
Fort Knox, but appropriate for "sales counts on an office wall".

---

## Milestones

1. **Boards on a TV (static data).** Scaffold the Express app, port both boards to
   templates, deploy to Railway, point one PosterBooking screen at `/board/rotation`.
   Proves the display path end-to-end.
2. **Real numbers.** `/ingest` + SQLite, create the scheduled Claude Routine running the
   board queries, boards now show live-ish data (≤15 min lag).
3. **Live counters.** Onyx webhook endpoint (needs an admin to configure it in
   Admin → Dev Tools → Webhooks), classification ladder in server code, today's counts
   move in real time.
4. **Polish.** Rotation timing, stale badge, and a tiny secret-protected form so a manager
   can set the day's focus message / target without a rebuild.

## What we need from a human

- **Railway**: an account/project + the app's env secrets (I generate values; someone pastes).
- **Onyx** (Agency Administrator): a webhook endpoint for `POLICY_CREATED`/`POLICY_UPDATED`
  pointed at the Railway URL, with the signing secret shared into Railway. (Only needed at
  milestone 3 — milestones 1–2 need nothing from Onyx admin.)
- **PosterBooking**: add the Website/URL app with our board URL to the screen playlist.

## Open choices (defaults in bold, say the word to change)

- Rotation contents v1: **live today board + yesterday recap + MTD STHHC leaderboard**
- Snapshot cadence / hours: **every 15 min, 8:00–19:00 ET, Mon–Sat**
- Focus message: **set by manager via the mini form** (vs. auto-written by the morning Routine)
- Stack: **Node 20 + Express + SQLite** (no framework, ~a few hundred lines)
