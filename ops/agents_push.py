#!/usr/bin/env python3
"""Push the agent-dashboards roster (NPN, agent, core, combo) to the Worker's /ingest/agents.

Usage: GHE_INGEST_SECRET=... python3 ops/agents_push.py '<csv download_url>'

The CSV comes from the "Agent dashboards refresh" routine's SQL via sql_export_query_csv
(columns npn, agent, core, combo). Rows are passed through untouched; an empty CSV aborts.
"""
import csv
import datetime
import io
import json
import os
import sys
import time
import urllib.request

ENDPOINT = "https://ghealthe-tv-boards.lenzerevans1995.workers.dev/ingest/agents"
WINDOW = {"from": "2026-10-15", "to": "2026-12-07"}


def main():
    url = sys.argv[1]
    secret = os.environ["GHE_INGEST_SECRET"]
    raw = urllib.request.urlopen(url, timeout=60).read().decode("utf-8-sig")
    rows = [
        {"npn": str(r["npn"]).strip(), "agent": r["agent"], "core": int(r["core"]), "combo": int(r["combo"])}
        for r in csv.DictReader(io.StringIO(raw))
    ]
    if not rows:
        print("ABORT empty result, nothing pushed")
        sys.exit(1)
    body = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window": WINDOW,
        "rows": rows,
    }
    data = json.dumps(body).encode()
    last = None
    for _ in range(5):
        try:
            req = urllib.request.Request(
                ENDPOINT, data=data, method="POST",
                headers={"Authorization": "Bearer " + secret, "Content-Type": "application/json"},
            )
            last = urllib.request.urlopen(req, timeout=60).read().decode()
            if '"ok":true' in last.replace(" ", ""):
                print("agents OK %s | rows=%d core=%d combo=%d" % (
                    last, len(rows), sum(r["core"] for r in rows), sum(r["combo"] for r in rows)))
                return
        except Exception as e:
            last = str(e)
        time.sleep(3)
    print("FAIL", last)
    sys.exit(1)


if __name__ == "__main__":
    main()
