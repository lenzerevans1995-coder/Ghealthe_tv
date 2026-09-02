# Get Health-e — Floor TV Boards

Live-updating scoreboards for the TVs above the Medicare Inbound floor, served by a
Cloudflare Worker and displayed through PosterBooking's Website/URL app. Data comes from
Onyx two ways: a scheduled Claude Routine pushing verified snapshots (source of truth)
and Onyx policy webhooks nudging today's counts in real time. Full design in `PLAN.md`.

## Routes

| Route | What it shows |
|---|---|
| `/board/live` | Today's running production (Core / STHHC / HI / Ancillary / Total), calls, conversion, today's leaders |
| `/board/sales` | **Live Sales** — the newest write across the screen (name, product, carrier and plan), the five before it, today's Core / STHHC / HI tally, and a scrolling roll of everyone on the board. Stands alone like `/board/run15` — its own screen, its own feed (`/board/sales/feed.js`), no ticker bar layered on top — but it drops into the rotation too (`?boards=live,sales,daily`) |
| `/board/paperchase` | **The Paper Chase** — September STHHC/HI contest standings: top scorers, the four individual races, team points, first-to-a-grand, floor unlock and the weekly draw. Its own screen and its own feed (`/board/paperchase/feed.js`), served from the `paper_chase` row in D1 rather than the snapshot, which a Routine push would overwrite. Drawn at a fixed 1920x1080 and scaled to the screen, so a TV of any resolution or aspect gets the design as intended rather than type and boxes resizing at different rates (`?overscan=5` trims edges a TV crops; `?debug=1` shows the measured viewport and scale). Carries the new-sale takeover: a full-screen card when an agent's STHHC or HI app count rises, 8 s, then back to the standings. Refresh it by pushing new standings to `/ingest/paperchase` |
| `/board/daily` | Yesterday's recap + selling days left + today's focus push |
| `/board/leaders/sthhc` | STHHC leaderboard (top 5 + floor totals) |
| `/board/contest/sthhc` | STHHC ticket-run contest — prizes, the six qualifying rules, and selling days left until the contest closes (edit `CLOSE`/`CLOSE_LABEL` in `src/static_boards.js` to re-run it for another game; the flyer is `assets/`, served under a versioned filename so a replacement can't be masked by the TVs' day-long image cache — keep it a JPEG, since bundled images count against the Worker's 3 MiB limit) |
| `/board/rotation` | Cycles the boards with a crossfade — **this is the URL for PosterBooking** (`?boards=live,daily,leaders/sthhc&dwell=20`) |
| `/console` | Desk view — left menu rail for clicking between Live, Live Sales, The Paper Chase, MTD, STHHC Leaders and the Ticket Run (`?board=mtd` opens on a tab). The rail exists only here; `/board/*` stays chrome-free for the TVs |
| `/api/stats` | Merged snapshot JSON (what the boards render from) |
| `/ingest` | POST, bearer-secret — snapshot push from the Claude Routine |
| `/webhooks/onyx` | POST, HMAC-verified — Onyx POLICY_CREATED / POLICY_UPDATED. Moves today's counts, and scores contest points for The Paper Chase |
| `/api/webhook-status` | What the webhook endpoint has actually received (counts, last delivery, last event type) — the answer to "is Onyx delivering?", which `policy_events` cannot give because every snapshot push prunes it |
| `/healthz` | Liveness, no auth |

All GET routes require the board key. Pass it as `?key=<BOARD_KEY>` — or visit
`/unlock?key=<BOARD_KEY>` once on a device and it is saved in an HttpOnly cookie,
after which plain URLs like `/console` and `/board/mtd` work on their own. `?key=`
keeps working either way, so a TV that loses its cookies never locks itself out.
`/unlock` takes an optional `&to=/board/mtd` to land somewhere other than the console.
To hand the boards to someone else, share `/k/<BOARD_KEY>` — same thing with the key in
the path, which survives link shorteners and chat apps that strip query strings. Sharing a
plain `/console` link does not work: the cookie lives on your device, not in the link. Boards self-refresh
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

Deploys need Cloudflare credentials. `wrangler login` is interactive, so in a Claude Code
session set **`CLOUDFLARE_API_TOKEN`** as an environment variable on the environment the
session runs in (claude.ai/code → Environments) rather than pasting a token into the chat:
every new session then inherits it, and the token stays out of transcripts. Scope it to
Account → *Workers Scripts: Edit* and *D1: Edit* — that is all any command here needs.

```bash
npm install
npx wrangler login                          # or the CLOUDFLARE_API_TOKEN env var above
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

`POST /ingest/paperchase` takes the same bearer secret and a `{ generated_at, rows }` body —
one row per agent (`agent`, `points`, `points_week`, `sthhc_apps`, `sthhc_apps_q`, `sthhc_prem`,
`hi_apps`, `hi_prem`), exactly the shape of the contest query. It is stored under its own key,
so snapshot pushes leave it alone.

Between those pushes the board moves on Onyx webhooks: a POLICY_CREATED for an STHHC or HI
is scored on arrival (premium at or above the $50 / $30 bar scores in full, below it scores
half) and folded over the last push, so a write reaches the wall in seconds. Two limits are
worth knowing. The delivery carries no call id, so the "STHHC written on the same call as a
Core scores zero" rule falls back to matching the lead — an approximation the next push
recomputes properly. And the delivery names the agent only by email and user id, so the name
comes from the `agent_roster` row in D1; an agent missing from it is recorded but not scored
until the next push, rather than shown under a guessed name. Refresh that roster when people
join.

### Contest rules the board encodes

An STHHC written on the same call as a Core scores **zero** — no points, and no credit toward
First to a Grand. That second half is why the feed carries `sthhc_prem_scored` separately from
`sthhc_prem`: the grand race sums the scored figure, so a zeroed app moves neither panel, and
the team-points and grand-race numbers agree. Three figures deliberately stay on **all**
premium, because they describe what was written rather than what the contest pays: Premium
written, the floor-unlock average against the $62 bar, and the Best STHHC Premium race.

Both scoring paths implement this, and both must change together or the board flips answers
every hour: the Routine's SQL (`s.pts > 0` filter) and `loadContestStandings()` in
`src/index.js`. The webhook path approximates the same-call test on the lead, since the
delivery carries no call id; the hourly push recomputes it from the call itself.

The overlay counts a delivery only when the policy was *written* after the baseline, not
merely delivered after it. Onyx sends POLICY_UPDATED for edits, so a premium keyed wrong and
corrected minutes later arrives as a fresh delivery for a policy the baseline already counts:
adding it again would double the agent's total and throw a celebration for a sale the floor
already watched. Corrections therefore land on the next push, which recomputes them from
source — up to an hour, and right rather than fast.
