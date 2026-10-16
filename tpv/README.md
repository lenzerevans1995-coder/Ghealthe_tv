# TPV completions board

`ghe-board.com/board/tpv` shows TPVs by Benefit Rep from **TPV Tracker.xlsx** on SharePoint.
A Routine rebuilds it every 3 hours on weekdays; the page reloads itself every 10 minutes.

**Source:** `file:///b!_7SEPn5_8EqJpMs0HyddWZdQRLCTxYRDkBITl9XXEnuBycxCACL_T5ofPDc9_NOs/01M364AL2TM64XVSXJTFBKEMX7AP5DTT2H`
(read with the Microsoft 365 connector's `read_resource`). If it 404s, search SharePoint for
"TPV Tracker" (xlsx) and use the new id.

## Each run

1. Read the workbook with the connector and save the text it returns to `tpv/input/tracker.txt`
   (ignored by git: it holds client names and phone numbers).
2. `python3 -I tpv/build_tpv_board.py --tracker tpv/input/tracker.txt --date <today, Eastern> --out tpv/input/run`
   It prints a report and writes the board HTML plus `payload.json`. It stops without writing
   anything if a tab read short of its declared size.
3. `POST` `payload.json` to `/ingest/tpv` with the ingest bearer secret. The Worker refuses a push
   whose floor row doesn't add up.

## Rules (in `build_tpv_board.py`)

- **Tabs:** only the current month's (October: "Oct 1-14" and "Oct AEP 15-31"). Earlier months'
  tabs overlap and would double count.
- **Counted:** TPV, HRA, Mail-Order, Video, IHWV. Only `Y` / `YES` counts (case and spaces ignored).
  `N`, `NO`, `N/A`, `NA` and blanks don't. Anything else counts as not-Y and is listed in the report
  as `bad_values`. A row with all five blank is left out entirely.
- **Duplicates:** a row with the same rep and the same SunFire Enrollment Code as one already counted
  this month is counted once and listed in the report as `duplicates`.
- **Names:** reps are grouped by first name (the early tabs only have first names), with Jamie /
  Jaime / Jaimie / Jamie(Jaime) as Jaime and Jeahne / Jeahne-Renee as Jeahne-Renee. The board shows
  the full name: the longest multi-word name found for that rep on any counted tab (the AEP tabs
  carry them), with emojis stripped. A rep who only appears with a first name shows the first name. Rows with no Benefit Rep become
  the muted "No name on the row" row (TPV and HRA only), so the floor row still reconciles.
- **Rail:** Total TPV is the floor; HRA attached is HRA / TPV; verifications per day is floor TPV
  over weekdays elapsed this month, today included.

`template.html` is the design as handed over. Only the numbers, the header window and the rail
change; the site serves it from `src/boards/tpv_board.html` (the same file plus the reload tag).
`render.mjs` renders a 1920x1080 JPG of a built board when one is needed for a playlist.
