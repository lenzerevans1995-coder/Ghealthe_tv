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
| `/board/draw` | **Weekly Draw** — the Friday $50 raffle. Counts down to 4:00 PM ET, closes the hat at 3:59, runs the draw on its own and leaves the winner up. Tickets are `FLOOR(points_week / 50)` read straight from the contest board's feed, so the drum and the standings can never disagree. Nobody presses anything |
| `/board/draw/preview` | The same board on a 10-second clock, looping countdown → draw → winner, for checking it before Friday |
| `/board/teampoints`, `/board/teams`, `/board/races`, `/board/draws` | The four contest boards — team points, every seat by team, the five individual races, and the cash draws. All read the Paper Chase feed and repaint over the socket |
| `/board/aep` | **AEP appointment tracker** — enrollment appointments booked per agent for a set window (week 1 is 10/15–10/21, goal 40 each), ranked with ties, a floor total, agents with one or more booked, and days until AEP opens. Feed is `/board/aep/feed.js`; counts are pushed to `/ingest/aep` |
| `/board/beatdraw`, `/board/beatdraw/preview` | **Beat Your Number draw** — pulls three names from the agents who cleared their own summer number, one every five seconds, each posted as it lands and taken out of the pool, then a celebration board with just the three names. `/preview` loops it on a short clock with the live pool; `?seed=abc` pins a preview's winners, `?at=7.2` freezes it on a moment, `?countdown=3` shortens its countdown |
| `/board/lasthat`, `/board/lasthat/preview` | **The Last Hat** — one $500 winner drawn from a hat weighted by tickets (one per 50 points, ×2 over your summer number, ×3 at 130%, +3 for 12 apps). The hat as a grid with each holder's tickets, a five-second spotlight spin, the winner posted, then a celebration. Armed by a `lasthat_config` row, result stored as `lasthat:<contest>`; same preview options as the Beat Your Number board |
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

## AEP appointment tracker

`/board/aep` counts **enrollment appointments** per agent that *start* inside a window — not
appointments booked inside it. Most of what shows up for 10/15–10/21 was booked weeks or months
ago for those dates, so the count only ever grows until the window passes.

An agent's count is the pipeline appointments with `appointment_type = 'ENROLLMENT'` whose start
falls on an Eastern-time date in the window, excluding any whose task is cancelled, attributed to
`COALESCE(appointments.user_id, tasks.assigned_to_user_id, tasks.created_by_user_id)` and never to
the system user (-1). The roster is worker profile 507, `ENABLED`, minus the standing exclusions
(8, 1108, 3748, 1595, 1607), the same cohort as the MTD sales report, so an agent with nothing booked
still appears as a zero and the "of N" is the real floor. It reproduces the hand-built board it
replaced for 28 of 29 agents; the exception is one extra appointment in Onyx for Jalen McClendon.

A Routine runs the query and POSTs `{generated_at, window, goal, aep_open, rows:[{agent, booked}]}`
to `/ingest/aep` with the same bearer secret as the other pushes. The Worker stores it as the
`aep_tracker` row, remembers the first push of each Eastern day so the board can say "up from N
this morning", and tells open boards over the socket. An empty or malformed roster is refused, so a
failed query leaves the last real counts on screen instead of blanking them.

The window, the goal and the AEP open date travel in the push, so the board has none of them
written in. Moving to week 2 means changing the window in the Routine's query and payload.

## Beat Your Number draw

Three names, one every five seconds. The server decides all three at the draw time and stores
them, exactly as the weekly draw does, so every screen shows the same names and a reload cannot
re-roll them. The browser only *reveals* what the record says: draw *k* starts `5 × (k−1)` seconds
after the draw time, spins for 2.5 seconds, and posts its name when it lands. The whole board is a
function of "seconds since the draw time", so a screen that opens halfway through lands in the right
place. About 4 seconds after the last name posts it gives way to the celebration, which stays up.

The pool is everyone whose points this month are at least their own summer number (the same test
the Cash Draws board uses, from the same roster in `src/contest_roster.json`), one name each. Names
are drawn without replacement, using the same rejection sampling as the weekly draw. The record keeps
the pool as it stood, so the draw can be audited afterwards. An empty pool writes nothing.

**It does nothing until it is armed.** A board left on a TV must never run a real draw by itself, so
the draw date is a row, not a constant:

```
npx wrangler d1 execute ghealthe_tv --remote --command \
  "INSERT INTO kv (k,v,updated_at) VALUES ('beatdraw_config','{\"draw_at\":\"2026-10-02T20:00:00Z\",\"contest\":\"2026-09\"}',datetime('now')) \
   ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at"
```

The result is stored as `beatdraw:<contest>`. To run it again, delete that row or arm a new
`contest`. Until armed, the live board shows the pool and "Date to be announced".

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
worth knowing. The delivery carries no call id and cannot tell one call from several, so the
one-call rule (below) falls back to matching the lead: an STHHC and a Core keyed for the same
customer in the same stretch are held out until the next push, which recomputes it from the
calls themselves. And the delivery names the agent only by email and user id, so the name
comes from the `agent_roster` row in D1; an agent missing from it is recorded but not scored
until the next push, rather than shown under a guessed name. Refresh that roster when people
join.

### Contest rules the board encodes

An STHHC sold to a customer on the same day as their Core counts only if the customer had more
than one call with that agent that day. On a single call it broke the rule and **counts nowhere**:
no points, no credit toward First to a Grand, and it is left out of the app and premium totals
too — apps written, premium written, the floor-unlock average against the $62 bar, and the two
premium and count races. An STHHC with no Core to that customer that day is unaffected, and so
is an HI.

The test is made in Onyx, per agent and per Eastern-time day: a Core and an STHHC to the same
person by the same agent, and fewer than two calls (distinct `lead_interaction_id`) between them
that day, not counting coaching, shadowing, barge or calls that never connected. It is *not* a
comparison of the two policies' call records, which is stricter: a Core and an STHHC sold within
one call of a customer who also called twice more that day count, because there were multiple
calls. Change it in the `attached` CTE of the Routine's SQL.

`sthhc_prem_scored` is still in the feed for the boards that read it, and now always equals
`sthhc_prem`.

Both scoring paths implement this, and both must change together or the board flips answers
every hour: the Routine's SQL and `loadContestStandings()` in `src/index.js`. The webhook path
holds an ambiguous STHHC out entirely rather than counting it, so a sale appears late rather than
appearing and being taken back.

The overlay counts a delivery only when the policy was *written* after the baseline, not
merely delivered after it. Onyx sends POLICY_UPDATED for edits, so a premium keyed wrong and
corrected minutes later arrives as a fresh delivery for a policy the baseline already counts:
adding it again would double the agent's total and throw a celebration for a sale the floor
already watched. Corrections therefore land on the next push, which recomputes them from
source — up to an hour, and right rather than fast.
