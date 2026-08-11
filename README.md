# Get Health-e — Floor TV Boards

Live-updating scoreboards for the TVs above the Medicare Inbound floor, served by a
Cloudflare Worker and displayed through PosterBooking's Website/URL app. Data comes from
Onyx two ways: a scheduled Claude Routine pushing verified snapshots (source of truth)
and Onyx policy webhooks nudging today's counts in real time. Full design in `PLAN.md`.

## Routes

| Route | What it shows |
|---|---|
| `/board/live` | Today's running production (Core / STHHC / HI / Ancillary / Total), calls, conversion, today's leaders |
| `/board/daily` | Yesterday's recap + selling days left + today's focus push |
| `/board/leaders/sthhc` | STHHC leaderboard (top 5 + floor totals) |
| `/board/contest/sthhc` | STHHC ticket-run contest — prizes, the six qualifying rules, and selling days left until the contest closes (edit `CLOSE`/`CLOSE_LABEL` in `src/static_boards.js` to re-run it for another game) |
| `/board/rotation` | Cycles the boards with a crossfade — **this is the URL for PosterBooking** (`?boards=live,daily,leaders/sthhc&dwell=20`) |
| `/api/stats` | Merged snapshot JSON (what the boards render from) |
| `/ingest` | POST, bearer-secret — snapshot push from the Claude Routine |
| `/webhooks/onyx` | POST, HMAC-verified — Onyx POLICY_CREATED / POLICY_UPDATED |
| `/healthz` | Liveness, no auth |

All GET routes require `?key=<BOARD_KEY>` once the secret is set. Boards self-refresh
every 45 s (body swap, no reload — no flash on the TVs) and show an "as of" stamp with a
stale warning if the snapshot is older than 25 minutes. Until the first real ingest, the
boards render seeded demo data (marked "demo data" on screen).

## Snapshot Routines

Six staggered Claude Routines ("Floor TV scoreboard snapshot (:05)" … "(:55)",
crons `5 12-22 * * 1-6` through `55 12-22 * * 1-6` UTC) refresh the snapshot
every 10 minutes, 8:05am–6:55pm ET Mon–Sat. The Routine platform's minimum
schedule is hourly, hence six staggered triggers instead of one 10-minute cron. They fire
into the session that built this app (self-bind) because fresh-session firings
can't carry the Onyx connector when created from a session; recreate them from
the claude.ai Routines UI as fresh-session Routines if that session is ever
retired. Crons are UTC: after the November DST change, shift the hour range from
12-22 to 13-23 to keep the same ET window.

## Deploy (one time)

```bash
npm install
npx wrangler login                          # or CLOUDFLARE_API_TOKEN env var
npx wrangler d1 create ghealthe_tv          # paste the printed database_id into wrangler.toml
npm run db:init
npx wrangler secret put BOARD_KEY           # any long random string
npx wrangler secret put INGEST_SECRET       # any long random string
npx wrangler secret put ONYX_SIGNING_SECRET # from Onyx Admin > Dev Tools (milestone 3)
npm run deploy
```

The deploy prints the public URL, e.g. `https://ghealthe-tv-boards.<account>.workers.dev`.

## PosterBooking

Add a **Website / URL** app pointing at:

```
https://ghealthe-tv-boards.<account>.workers.dev/board/rotation?key=<BOARD_KEY>
```

Set PosterBooking's own page-reload to something long (e.g. daily) — the page manages its
own refresh. TVs are assumed 16:9 landscape.

## Snapshot ingest contract

`POST /ingest` with `Authorization: Bearer <INGEST_SECRET>` and a JSON body containing at
minimum `generated_at` (ISO timestamp), `today`, and `month`; see `src/demo.js` for the
full shape the boards consume. Each push replaces the snapshot wholesale and prunes
webhook events already covered by it.
