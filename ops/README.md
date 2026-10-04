# Routine helper (`ops/`)

The three scheduled Claude Routines (scoreboard every 10 min, AEP tracker every 30,
Paper Chase hourly) used to carry their whole recipe — SQL, build rules, JSON shape,
curl — in a stored prompt of 2–7k tokens, and every Onyx result came back through the
chat. Now the recipe lives here and the data never enters the conversation:

```
python3 ops/refresh.py sql <kind>            # prints the one SQL statement
   -> send that SQL, unchanged, to Onyx sql_export_query_csv  -> download_url
python3 ops/refresh.py run <kind> '<url>'    # fetch CSV, build JSON, POST to the Worker
```

`kind` is `scoreboard`, `aep` or `paperchase`. Secrets are read from `GHE_INGEST_SECRET`
(bearer for the POSTs) and `GHE_BOARD_KEY` (read key for `/api/stats`); they are never
committed — the routine prompts set them on the command line.

* `scoreboard` — one query returns everything as long-format CSV (`meta`, `dp` day×product
  counts, `ad` agent×day, `calls`, `roster`, `sale` newest 40 writes, `sthhc` today's STHHC).
  `refresh.py` builds the full snapshot **statelessly** from it: today / yesterday / MTD blocks,
  pace, split, leaders, ★ rows, ticker, STHHC list, selling days. The only things carried over
  from the live board are the manager-edited `focus`, `leaders_sthhc` and `mtd.push`. Because it
  keeps no files between runs, the Monday rollover needs no special handling and a container
  reset loses nothing. `sql scoreboard` prints `SKIP` if the board was refreshed under 5
  minutes ago (late duplicate firings).
* `aep` — roster × booked appointments for the window in `config.json`.
* `paperchase` — the contest standings query, date range from `config.json`.

`config.json` holds the values that change by hand: the AEP week window / goal, and the
Paper Chase date range (currently still **Sep 1–30**).

## Checking a change

`--dry-run` builds and prints a summary without POSTing; `--out file.json` saves the JSON;
`--now 2026-10-02T22:56:26Z` replays a moment and `sql scoreboard --today 2026-10-02` makes the
matching replay query. Replaying Friday Oct 2 reproduced the live snapshot exactly apart from
tie ordering and three plan names Onyx has since overwritten with policy numbers.

## Why not fresh-session Routines?

That would stop context building up in one session, but the platform will not attach the Onyx
connector to Routines created from a session (`connectors` is rejected for this organization),
so they stay bound to the building session and are kept lean instead. Crons are UTC — after the
November DST change move the hour range from 12-22 to 13-23.
