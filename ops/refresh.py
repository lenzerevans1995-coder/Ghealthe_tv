#!/usr/bin/env python3
"""Floor-TV routine helper: keeps Onyx query results out of the chat.

A routine run is now three steps instead of a page of instructions:

    python3 ops/refresh.py sql <kind>          # prints the one SQL statement to run
    (send it to Onyx sql_export_query_csv -> download_url)
    python3 ops/refresh.py run <kind> '<url>'  # fetch the CSV, build the JSON, POST it

kind = scoreboard | aep | paperchase.  Secrets come from the environment:
GHE_INGEST_SECRET (bearer for the POSTs) and GHE_BOARD_KEY (read key for /api/stats).
Add --dry-run to build and print a summary without POSTing, --now <ISO UTC> to
replay a moment (used to check the builder against a known snapshot), and
--out <file> to save the JSON that would be posted.  Standard library only.
"""
import calendar, csv, datetime as dt, io, json, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, 'config.json')))
WORKER = CFG['worker']
PROFILE = CFG['worker_profile_id']

# House classification ladder -- identical to the rules in the Worker's classify.js
# and to the stored routine prompts: HRA stripped, STHHC before HI, MA-family is Core.
PRODUCT = """CASE WHEN lower(p.policy_type)='hra' OR (p.carrier_name='Unknown' AND upper(p.policy_name) LIKE '%HRA%') THEN NULL WHEN lower(p.policy_type) LIKE 'short%term%home%health%' OR (lower(p.carrier_name) LIKE '%gtl%' AND lower(p.policy_name) LIKE '%home health%') OR lower(p.policy_name) LIKE '%sthhc%' THEN 'sthhc' WHEN lower(p.policy_type) IN ('mapd','ma','ma_only','dsnp','csnp','pdp','medicare_advantage') THEN 'core' WHEN lower(p.policy_type) LIKE '%hospital_indemnity%' THEN 'hi' ELSE 'ancillary' END"""


def utcnow(args):
    if '--now' in args:
        return dt.datetime.strptime(args[args.index('--now') + 1], '%Y-%m-%dT%H:%M:%SZ')
    return dt.datetime.utcnow().replace(microsecond=0)


def hst_today(now):  # policy day = Hawaii date (UTC-10, no DST)
    return (now - dt.timedelta(hours=10)).date()


# ---------------------------------------------------------------- SQL ----

def sql_scoreboard(today=None):
    """today=None -> the statement is static (Hawaii date taken from the database clock);
    pass a date to replay a past day."""
    if today is None:
        T = "(now() - INTERVAL '10 hours')::date"
        M1 = "date_trunc('month', now() - INTERVAL '10 hours')::date"
        LB = "(date_trunc('month', now() - INTERVAL '10 hours') - INTERVAL '1 month')::date"
        TS = f"{T}::text"
    else:
        lookback = (today.replace(day=1) - dt.timedelta(days=1)).replace(day=1)  # first of last month
        T, LB, TS = f"DATE '{today}'", f"DATE '{lookback}'", f"'{today}'"
        M1 = f"DATE '{today.replace(day=1)}'"
    return f"""WITH roster AS (SELECT user_id FROM user_worker_profile_rels WHERE worker_profile_id = {PROFILE}),
pol AS (SELECT p.user_id, (p.submitted_timestamp - INTERVAL '10 hours')::date AS d, p.submitted_timestamp AS ts, p.policy_name, p.carrier_name, n.premium_amount AS prem, {PRODUCT} AS product FROM policies p JOIN roster r ON r.user_id = p.user_id LEFT JOIN no_platform_medicare_policies n ON n.id = p.policy_source_id AND p.policy_source = 'no_platform_medicare_policies' WHERE (p.submitted_timestamp - INTERVAL '10 hours')::date >= {LB} AND p.submitted_timestamp <= now())
SELECT 'meta' AS k, 'today' AS a, {TS} AS b, NULL::text AS c, NULL::text AS d, NULL::text AS e, NULL::numeric AS n1, NULL::numeric AS n2, NULL::numeric AS n3, NULL::numeric AS n4
UNION ALL SELECT 'dp', d::text, product, NULL, NULL, NULL, COUNT(*), NULL, NULL, NULL FROM pol WHERE product IS NOT NULL GROUP BY d, product
UNION ALL SELECT 'ad', pol.d::text, u.first_name || ' ' || u.last_name, to_char(MIN(pol.ts) FILTER (WHERE product IN ('core','sthhc')), 'YYYY-MM-DD HH24:MI:SS'), NULL, NULL, COUNT(*) FILTER (WHERE product = 'core'), COUNT(*) FILTER (WHERE product = 'sthhc'), COUNT(*) FILTER (WHERE product = 'hi'), COUNT(*) FILTER (WHERE product = 'ancillary') FROM pol JOIN users u ON u.id = pol.user_id WHERE product IS NOT NULL GROUP BY pol.d, u.id, u.first_name, u.last_name
UNION ALL SELECT 'calls', call_date_hst::text, NULL, NULL, NULL, NULL, COUNT(DISTINCT lead_interaction_id), NULL, NULL, NULL FROM telephonic_lead_interaction_analytics WHERE worker_profile_id = {PROFILE} AND is_rejected = false AND call_type <> 'COACHING' AND call_direction IN ('INBOUND','DIRECT_INBOUND') AND call_date_hst >= {LB} GROUP BY call_date_hst
UNION ALL SELECT 'roster', NULL, NULL, NULL, NULL, NULL, user_id, NULL, NULL, NULL FROM user_worker_profile_rels WHERE worker_profile_id = {PROFILE}
UNION ALL SELECT 'sale', to_char(s.ts AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York', 'YYYY-MM-DD HH24:MI'), u.first_name || ' ' || u.last_name, s.product, s.policy_name, s.carrier_name, s.prem, NULL, NULL, NULL FROM (SELECT *, row_number() OVER (ORDER BY ts DESC) AS rn FROM pol WHERE product IN ('core','sthhc','hi')) s JOIN users u ON u.id = s.user_id WHERE s.rn <= 40
UNION ALL SELECT 'sthhc', to_char(s.ts AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York', 'HH24:MI'), u.first_name || ' ' || u.last_name, NULL, NULL, NULL, s.prem, NULL, NULL, NULL FROM pol s JOIN users u ON u.id = s.user_id WHERE s.product = 'sthhc' AND s.d = {T}
UNION ALL SELECT 'sth', NULL, u.first_name || ' ' || u.last_name, NULL, NULL, NULL, COUNT(*), SUM(s.prem), COUNT(s.prem), NULL FROM pol s JOIN users u ON u.id = s.user_id WHERE s.product = 'sthhc' AND s.d >= {M1} AND s.d <= {T} GROUP BY u.id, u.first_name, u.last_name"""


def sql_aep():
    a = CFG['aep']
    ex = ', '.join(str(i) for i in a['excluded_user_ids'])
    w = a['window']
    return f"""WITH roster AS (
  SELECT DISTINCT user_id FROM user_worker_profile_rels
  WHERE worker_profile_id = {PROFILE} AND status ILIKE 'ENABLED'
    AND user_id NOT IN ({ex})
),
appt AS (
  SELECT COALESCE(a.user_id, t.assigned_to_user_id, t.created_by_user_id) AS uid
  FROM appointments a JOIN tasks t ON t.id = a.task_id
  WHERE a.appointment_type = 'ENROLLMENT' AND t.status <> 'CANCELLED'
    AND (a.start_time AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date BETWEEN DATE '{w['from']}' AND DATE '{w['to']}'
    AND COALESCE(a.user_id, t.assigned_to_user_id, t.created_by_user_id) <> -1
)
SELECT u.first_name || ' ' || u.last_name AS agent, COUNT(appt.uid) AS booked
FROM roster r JOIN users u ON u.id = r.user_id LEFT JOIN appt ON appt.uid = r.user_id
GROUP BY 1 ORDER BY booked DESC, agent"""


def sql_paperchase():
    c = CFG['paperchase']
    return f"""WITH base AS (
  SELECT p.id, p.user_id, p.policy_name, p.carrier_name, p.policy_type, l.person_id,
         COALESCE(n.premium_amount,0) AS prem,
         (p.submitted_timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York') AS sub_et
  FROM policies p
  LEFT JOIN leads l ON l.id = p.lead_id
  LEFT JOIN no_platform_medicare_policies n
    ON n.id = p.policy_source_id AND p.policy_source='no_platform_medicare_policies'
  WHERE (p.submitted_timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date
        BETWEEN DATE '{c['from']}' AND DATE '{c['to']}'
    AND NOT (LOWER(p.policy_type)='hra' OR p.carrier_name ILIKE '%hra%' OR p.policy_name ILIKE '%hra%')
),
classed AS (
  SELECT b.*, b.sub_et::date AS day_et, CASE
    WHEN LOWER(policy_type) IN ('home_health_care','home health','short_term_home_health_care','short_term_home_health')
      OR carrier_name ILIKE '%short term home health%'
      OR policy_name ILIKE '%home health%' OR policy_name ILIKE '%short term%' THEN 'STHHC'
    WHEN LOWER(policy_type) IN ('hmo','ppo','mapd','ma','ma_only','dsnp','csnp','core') THEN 'CORE'
    WHEN LOWER(policy_type) IN ('other','ancillary','life')
      AND (policy_name ILIKE '%dual complete%' OR policy_name ILIKE '%(hmo%' OR policy_name ILIKE '%(ppo%' OR policy_name ILIKE '%snp-de%') THEN 'CORE'
    WHEN LOWER(policy_type) IN ('hospital_indemnity','hospital indemnity') THEN 'HI'
    ELSE 'OTHER' END AS bucket
  FROM base b
),
cand AS (
  SELECT DISTINCT s.id, s.user_id, s.person_id, s.day_et
  FROM classed s
  JOIN classed k ON k.bucket='CORE' AND k.user_id=s.user_id AND k.person_id=s.person_id AND k.day_et=s.day_et
  WHERE s.bucket='STHHC' AND s.person_id IS NOT NULL
),
attached AS (
  SELECT c.id FROM cand c
  WHERE (SELECT COUNT(DISTINCT tw.lead_interaction_id)
         FROM telephonic_worker_lead_interactions tw
         JOIN lead_interactions li ON li.id = tw.lead_interaction_id
         JOIN leads l2 ON l2.id = li.lead_id
         WHERE l2.person_id = c.person_id AND tw.user_id = c.user_id
           AND tw.status <> 'DID_NOT_CONNECT'
           AND tw.call_type NOT IN ('COACHING','SHADOWING','SUPERVISOR_BARGE')
           AND (li.started_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date = c.day_et) < 2
),
scored AS (
  SELECT c.user_id, c.bucket, c.prem, c.sub_et,
    CASE
      WHEN c.bucket='STHHC' AND c.prem >= 50 THEN ROUND(c.prem::numeric)
      WHEN c.bucket='STHHC' THEN ROUND((c.prem/2)::numeric)
      WHEN c.bucket='HI' AND c.prem >= 30 THEN ROUND(c.prem::numeric)
      WHEN c.bucket='HI' THEN ROUND((c.prem/2)::numeric)
      ELSE 0 END AS pts
  FROM classed c
  WHERE c.bucket IN ('STHHC','HI') AND c.id NOT IN (SELECT id FROM attached)
)
SELECT u.first_name||' '||u.last_name AS agent,
  SUM(s.pts) AS points,
  COALESCE(SUM(s.pts) FILTER (WHERE s.sub_et >= DATE_TRUNC('week', NOW() AT TIME ZONE 'America/New_York')),0) AS points_week,
  COUNT(*) FILTER (WHERE s.bucket='STHHC') AS sthhc_apps,
  COUNT(*) FILTER (WHERE s.bucket='STHHC' AND s.prem>=50) AS sthhc_apps_q,
  COALESCE(SUM(s.prem) FILTER (WHERE s.bucket='STHHC'),0) AS sthhc_prem,
  COALESCE(SUM(s.prem) FILTER (WHERE s.bucket='STHHC'),0) AS sthhc_prem_scored,
  COALESCE(SUM(s.pts) FILTER (WHERE s.bucket='STHHC'),0) AS sthhc_pts,
  COUNT(*) FILTER (WHERE s.bucket='HI') AS hi_apps,
  COALESCE(SUM(s.prem) FILTER (WHERE s.bucket='HI'),0) AS hi_prem,
  COALESCE(SUM(s.pts) FILTER (WHERE s.bucket='HI'),0) AS hi_pts
FROM scored s JOIN users u ON u.id=s.user_id
GROUP BY 1 ORDER BY points DESC"""


# ------------------------------------------------------------ plumbing ----

def curl(args, data=None, tries=1, wait=4, ok=None):
    """Run curl; return stdout. Retries until `ok(stdout)` is true (default: any 2xx body)."""
    last = ''
    for i in range(tries):
        cmd = ['curl', '-sS', '-m', '60'] + args
        r = subprocess.run(cmd, input=data, capture_output=True, text=True)
        last = (r.stdout or '') + (r.stderr or '')
        if r.returncode == 0 and (ok is None or ok(r.stdout)):
            return r.stdout
        if i + 1 < tries:
            time.sleep(wait)
    raise SystemExit(f'FAILED after {tries} tries: {last[:300]}')


def fetch_csv(url):
    body = curl([url], tries=3, wait=3, ok=lambda s: s and not s.lstrip().startswith('<?xml'))
    return list(csv.DictReader(io.StringIO(body)))


def post(path, payload, expect=None):
    secret = os.environ.get('GHE_INGEST_SECRET') or sys.exit('GHE_INGEST_SECRET not set')
    return curl(['-X', 'POST', '-H', f'Authorization: Bearer {secret}', '-H', 'Content-Type: application/json',
                 '--data-binary', '@-', WORKER + path], data=json.dumps(payload, ensure_ascii=False),
                tries=5, wait=4, ok=lambda s: '"ok":true' in s)


def live_snapshot():
    key = os.environ.get('GHE_BOARD_KEY') or sys.exit('GHE_BOARD_KEY not set')
    body = curl([f'{WORKER}/api/stats?key={key}'], tries=3, wait=3, ok=lambda s: s.startswith('{'))
    return json.loads(body)


def num(x):
    return None if x in (None, '') else float(x)


def r1(x):  # round half up to one decimal, like the stored routine's rule
    return float(int(x * 10 + 0.5)) / 10


def stamp(now):
    return now.strftime('%Y-%m-%dT%H:%M:%SZ')


# ---------------------------------------------------------- scoreboard ----

def rank_key(c, s):  # position groups: by Core count; agents with no Core rank by STHHC
    return (1, c) if c > 0 else (0, s)


def board_rows(agents, limit=4, mtd=False):
    """agents: [{name,core,sthhc,total,first}] -> top rows with shared positions."""
    pool = [a for a in agents if a['core'] > 0 or a['sthhc'] > 0]
    pool.sort(key=lambda a: (-a['core'], -a['sthhc'], -a['total'], a['first'] or '9', a['name']))
    rows, pos, prev = [], 0, None
    for a in pool[:limit]:
        k = rank_key(a['core'], a['sthhc'])
        if k != prev:
            pos += 1
            prev = k
        if a['core'] > 0:
            what = f"<b>{a['core']}</b> core"
            if a['sthhc'] > 0:
                what += (f" &nbsp;&middot;&nbsp; <i>{a['sthhc']} STHHC</i>" if mtd
                         else f" &nbsp;+&nbsp; <b>{a['sthhc']}</b> sthhc")
        else:
            what = f"<b>{a['sthhc']}</b> sthhc"
        rows.append({'pos': str(pos), 'who': a['name'], 'what': what})
    return rows


def star_row(agents):
    if not agents:
        return []
    top = sorted(agents, key=lambda a: (-a['total'], a['name']))[0]
    return [{'pos': '★', 'who': top['name'], 'what': f"most policies — <b>{top['total']}</b>"}]


WARNINGS = []
MONTHS = [calendar.month_name[i] for i in range(1, 13)]


def fnum(x):  # 6.0 -> "6", 6.24 -> "6.2"
    t = f"{x:.1f}"
    return t[:-2] if t.endswith('.0') else t


def stale_months(obj, keep):
    txt = json.dumps(obj, ensure_ascii=False)
    return sorted({m for m in MONTHS if m not in keep and re.search(r'\b' + m + r'\b', txt)})


def prev_month_stats(dp, today):
    last = today.replace(day=1) - dt.timedelta(days=1)
    inm = lambda d: (d.year, d.month) == (last.year, last.month)
    tot = {p: sum(v for (d, pp), v in dp.items() if pp == p and inm(d)) for p in ('core', 'sthhc', 'hi')}
    days = {d for (d, _p) in dp if inm(d)}
    best = max([v for (d, pp), v in dp.items() if pp == 'sthhc' and inm(d)], default=0)
    return last.strftime('%B'), tot, len(days), best


def build_leaders_sthhc(rows, today, done, live):
    """STHHC board for the month so far, straight from the data. Month start with no STHHC yet
    keeps whatever the board already shows (it carries its own month label)."""
    agents = []
    for r in rows:
        if r['k'] == 'sth':
            n, tot, npr = int(float(r['n1'])), num(r['n2']) or 0.0, int(float(r['n3'] or 0))
            agents.append({'who': r['b'], 'count': n, 'prem': tot, 'avg': tot / npr if npr else 0.0})
    total_n = sum(a['count'] for a in agents)
    if not total_n:
        return live.get('leaders_sthhc')
    agents.sort(key=lambda a: (-a['count'], -a['avg'], a['who']))
    top = agents[:5]
    month = today.strftime('%B')
    prem_total = sum(a['prem'] for a in agents)
    prem_n = sum(int(float(r['n3'] or 0)) for r in rows if r['k'] == 'sth')
    floor_avg = prem_total / prem_n if prem_n else 0.0
    tie = any(top[i]['count'] == top[i + 1]['count'] for i in range(len(top) - 1))
    top_n = sum(a['count'] for a in top)
    k = f"${prem_total / 1000:.1f}k" if prem_total >= 1000 else f"${prem_total:.0f}"
    return {
        'month_label': f"{month} · Month to Date", 'eyebrow': 'Short-Term Home Health — Top 5',
        'title': f"{month}'s STHHC Leaders",
        'rows': [{'pos': str(i + 1), 'who': a['who'], 'count': a['count'], 'avg': f"${a['avg']:.0f}"} for i, a in enumerate(top)],
        'foot': 'Ranked by policies written.' + (' Ties broken by average monthly premium.' if tie else '') + f" Floor average: ${floor_avg:.2f}.",
        'floor': [{'n': str(total_n), 'l': 'STHHC written', 'eyebrow': f"Floor — {month} MTD"},
                  {'n': f"${floor_avg:.0f}", 'l': 'Avg monthly premium'}, {'n': k, 'l': 'Monthly premium written'}],
        'push': {'headline': f"These {len(top)} wrote {top_n} of our {total_n}.",
                 'body': f"{round(100 * top_n / total_n)}% of {month}'s STHHC so far came off {len(top)} desks in {done + 1} selling day{'s' if done else ''}. "
                         "<b>Today everybody writes 2.</b> Not on the MA call — set the callback."}}


def build_focus(live, ystd_sthhc, prev, prev_tot, prev_days, prev_best):
    f = json.loads(json.dumps(live.get('focus'))) if live.get('focus') else None
    if not f or not prev_days or not prev_tot['sthhc']:
        return live.get('focus')
    lead = f"We wrote <b>{ystd_sthhc}</b> yesterday" + (f" — {prev}'s best day" if ystd_sthhc and ystd_sthhc >= prev_best else '') + '.'
    line = f"{lead} {prev} averaged <b>{fnum(prev_tot['sthhc'] / prev_days)} a day</b>. Do it again today."
    for i, r in enumerate(f.get('rules', [])):
        if 'yesterday' in r:
            f['rules'][i] = line
    return f


def build_push(live, m, dp, today, done, total, prev, prev_tot, prev_days):
    old = (live.get('mtd') or {}).get('push')
    if not old or done < 1 or not prev_days or not all(prev_tot.values()):
        return old
    month = today.strftime('%B')
    inm = lambda d: (d.year, d.month) == (today.year, today.month) and d < today
    done_sthhc = sum(v for (d, pp), v in dp.items() if pp == 'sthhc' and inm(d))
    per_day = done_sthhc / done
    prev_avg = prev_tot['sthhc'] / prev_days
    pace = {p: int(sum(v for (d, pp), v in dp.items() if pp == p and inm(d)) / done * total + 0.5) for p in ('core', 'hi', 'sthhc')}
    behind = [n for n, p in (('Core', 'core'), ('HI', 'hi'), ('STHHC', 'sthhc')) if pace[p] < prev_tot[p]]
    gap = (' All three are ahead.' if not behind else ' <b>STHHC is the one behind.</b>' if behind == ['STHHC']
           else f" <b>Behind: {', '.join(behind)}.</b>")
    rules = list(old.get('rules') or [])
    if done < 3:  # a projection off one or two days says nothing; show the plain count against last month
        first = (f"{month} is <b>{done}</b> selling day{'s' if done != 1 else ''} in \u2014 <b>{m['core']}</b> core, <b>{m['hi']}</b> HI and "
                 f"<b>{m['sthhc']}</b> STHHC so far, against {prev}\u2019s {prev_tot['core']} / {prev_tot['hi']} / {prev_tot['sthhc']} for the whole month.")
        rules = [first] + rules[1:]
        return {'kicker': old.get('kicker'), 'headline': f"{fnum(per_day)} a day. {prev} ran {fnum(prev_avg)}.", 'rules': rules,
                'pills': [{'v': fnum(per_day), 'k': 'Per day now'}, {'v': fnum(prev_avg), 'k': f"{prev} average"}]}
    first = (f"After <b>{done}</b> selling day{'s' if done != 1 else ''}, {month} is pacing <b>{pace['core']}</b> core against {prev}’s {prev_tot['core']}, "
             f"<b>{pace['hi']}</b> HI against {prev_tot['hi']}, and <b>{pace['sthhc']}</b> STHHC against {prev_tot['sthhc']}.{gap}")
    rules = [first] + rules[1:]
    return {'kicker': old.get('kicker'),
            'headline': f"{fnum(per_day)} a day. {prev} ran {fnum(prev_avg)}.", 'rules': rules,
            'pills': [{'v': fnum(per_day), 'k': 'Per day now'}, {'v': fnum(prev_avg), 'k': f"{prev} average"}]}


PLAN_NUMBER = re.compile(r'^[A-Za-z]{2,5}\d{5,}$')  # e.g. a carrier policy number keyed over the plan name
PLAN_FALLBACK = {'hi': 'Hospital Indemnity', 'sthhc': 'Short-Term Home Health Care'}


def plan_label(product, plan):
    plan = plan or ''
    return PLAN_FALLBACK.get(product, plan) if PLAN_NUMBER.match(plan) else plan


def build_scoreboard(rows, now, live):
    meta = {r['a']: r['b'] for r in rows if r['k'] == 'meta'}
    today = dt.date.fromisoformat(meta['today'])
    dp, calls, agents_by_day = {}, {}, {}
    for r in rows:
        if r['k'] == 'dp':
            dp[(dt.date.fromisoformat(r['a']), r['b'])] = int(float(r['n1']))
        elif r['k'] == 'calls':
            calls[dt.date.fromisoformat(r['a'])] = int(float(r['n1']))
        elif r['k'] == 'ad':
            c, s, h, an = (int(float(r[k] or 0)) for k in ('n1', 'n2', 'n3', 'n4'))
            agents_by_day.setdefault(dt.date.fromisoformat(r['a']), []).append(
                {'name': r['b'], 'first': r['c'], 'core': c, 'sthhc': s, 'total': c + s + h + an})
    roster = sorted(int(float(r['n1'])) for r in rows if r['k'] == 'roster')
    if len(roster) < 20 or not calls or not any(d < today for d, _ in dp):
        raise SystemExit(f'ABORT: query result looks incomplete (roster={len(roster)}, calls days={len(calls)})')

    month = today.strftime('%B')
    wd = lambda d: d.strftime('%A')
    mon_days = [dt.date(today.year, today.month, i) for i in range(1, calendar.monthrange(today.year, today.month)[1] + 1)]
    sell = [d for d in mon_days if d.weekday() < 5]
    total, done = len(sell), len([d for d in sell if d < today])
    left = total - done
    prev = today - dt.timedelta(days=1)
    while prev.weekday() >= 5:
        prev -= dt.timedelta(days=1)
    prev2 = prev - dt.timedelta(days=1)
    while prev2.weekday() >= 5:
        prev2 -= dt.timedelta(days=1)

    cnt = lambda d, p: dp.get((d, p), 0)
    day_counts = lambda d: {p: cnt(d, p) for p in ('core', 'sthhc', 'hi', 'ancillary')}
    tot = lambda c: sum(c.values())

    t = day_counts(today)
    tcalls = calls.get(today, 0)
    today_blk = {'label': f"{wd(today)} &middot; {month} {today.day}", **t, 'total': tot(t), 'calls': tcalls,
                 'conversion': r1(100 * t['core'] / tcalls) if t['core'] and tcalls else None,
                 'leaders': board_rows(agents_by_day.get(today, []))}

    y = day_counts(prev)
    ycalls = calls.get(prev, 0)
    yag = agents_by_day.get(prev, [])
    yconv = r1(100 * y['core'] / ycalls) if ycalls else 0.0
    yesterday_blk = {
        'label': f"Yesterday — {wd(prev)}, {prev.strftime('%B')} {prev.day}", **y, 'total': tot(y),
        'subline': [f"<b>{ycalls:,}</b> inbound calls", f"<b>{yconv}%</b> core conversion",
                    f"<b>{sum(1 for a in yag if a['core'] > 0)}</b> agents on the core board",
                    f"<b>{sum(1 for a in yag if a['sthhc'] > 0)}</b> agents wrote an STHHC"],
        'board': board_rows(yag) + star_row(yag)}

    in_month = lambda d: d.year == today.year and d.month == today.month and d <= today
    m = {p: sum(v for (d, pp), v in dp.items() if pp == p and in_month(d)) for p in ('core', 'sthhc', 'hi', 'ancillary')}
    mcalls = sum(v for d, v in calls.items() if in_month(d))
    mtd_agents = {}
    for d, lst in agents_by_day.items():
        if not in_month(d):
            continue
        for a in lst:
            e = mtd_agents.setdefault(a['name'], {'name': a['name'], 'core': 0, 'sthhc': 0, 'total': 0, 'first': None})
            e['core'] += a['core']; e['sthhc'] += a['sthhc']; e['total'] += a['total']
            if a['first'] and (e['first'] is None or a['first'] < e['first']):
                e['first'] = a['first']
    magents = list(mtd_agents.values())
    mtd_blk = {
        'through_label': f"{wd(today)}, {month} {today.day} &middot; Live",
        'eyebrow': f"{month} MTD — {done + 1} selling days in", **m, 'total': tot(m),
        'split': [f"<b>{mcalls:,}</b> inbound calls",
                  f"<b>{r1(100 * m['core'] / mcalls) if mcalls else 0.0}%</b> core conversion",
                  f"{prev2.strftime('%a')} <b>{cnt(prev2, 'core')}</b> core &nbsp;&rarr;&nbsp; {prev.strftime('%a')} <b>{cnt(prev, 'core')}</b> core",
                  f"STHHC <b>{cnt(prev2, 'sthhc')}</b> &nbsp;&rarr;&nbsp; <b>{cnt(prev, 'sthhc')}</b>"],
        'leaders': board_rows(magents, mtd=True) + star_row(magents)}
    if done >= 1:  # month-end pace from COMPLETED days only
        mtd_blk['pace'] = {p: int(sum(v for (d, pp), v in dp.items() if pp == p and in_month(d) and d < today)
                                   / done * total + 0.5) for p in ('core', 'sthhc', 'hi')}
    prev, prev_tot, prev_days, prev_best = prev_month_stats(dp, today)
    mtd_blk['push'] = build_push(live, m, dp, today, done, total, prev, prev_tot, prev_days)
    focus = build_focus(live, y['sthhc'], prev, prev_tot, prev_days, prev_best)
    leaders_sthhc = build_leaders_sthhc(rows, today, done, live)
    for name, blk in (('focus', focus), ('push', mtd_blk['push']), ('leaders_sthhc', leaders_sthhc)):
        bad = stale_months(blk, {month, prev})
        if bad:
            WARNINGS.append(f"stale month in {name}: {', '.join(bad)}")

    ticker = [{'agent': r['b'], 'bucket': r['c'].upper(), 'plan': plan_label(r['c'], r['d']), 'carrier': r['e'],
               'premium': num(r['n1']), 'at': r['a']} for r in rows if r['k'] == 'sale']
    sthhc_today = sorted(({'agent': r['b'], 'premium': num(r['n1']), 'at': r['a']} for r in rows if r['k'] == 'sthhc'),
                         key=lambda x: x['at'])
    return {
        'generated_at': stamp(now), 'board_date': today.isoformat(), 'roster': roster,
        'month': {'label': month, 'selling_days_total': total, 'selling_days_done': done, 'selling_days_left': left,
                  'sub': f"{total} selling days in {month}<br>{done} down &middot; {left} to go, today included"},
        'focus': focus, 'today': today_blk, 'yesterday': yesterday_blk, 'mtd': mtd_blk,
        'leaders_sthhc': leaders_sthhc, 'sthhc_today': sthhc_today, 'ticker': ticker}


def scoreboard_summary(new, old):
    t, o = new['today'], (old.get('today') or {})
    bits = [f"{k} {o.get(k)}->{t[k]}" for k in ('core', 'sthhc', 'hi', 'ancillary', 'calls') if o.get(k) != t[k]]
    if old.get('board_date') != new['board_date']:
        bits.insert(0, f"NEW DAY {old.get('board_date')}->{new['board_date']}")
    first_new = ''
    seen = {(x['agent'], x['at']) for x in old.get('ticker', [])}
    fresh = [x for x in new['ticker'] if (x['agent'], x['at']) not in seen and x['at'][:10] == new['board_date']]
    if fresh:
        first_new = '; new: ' + ', '.join(f"{x['agent']} {x['bucket']} {x['premium']}" for x in fresh[:6])
    return (f"today c{t['core']}/s{t['sthhc']}/h{t['hi']}/a{t['ancillary']}={t['total']} calls={t['calls']} "
            f"mtd={new['mtd']['total']} | changed: {', '.join(bits) or 'none'}{first_new}")


# ----------------------------------------------------------- AEP / PC ----

def build_aep(rows, now):
    if not rows:
        raise SystemExit('ABORT: AEP query returned no rows')
    a = CFG['aep']
    out = [{'agent': r['agent'], 'booked': int(float(r['booked']))} for r in rows]
    return {'generated_at': stamp(now), 'window': a['window'], 'goal': a['goal'], 'aep_open': a['aep_open'], 'rows': out}


PC_INT = ('points', 'points_week', 'sthhc_apps', 'sthhc_apps_q', 'sthhc_pts', 'hi_apps', 'hi_pts')
PC_FLOAT = ('sthhc_prem', 'sthhc_prem_scored', 'hi_prem')


def build_paperchase(rows, now):
    out = []
    for r in rows:
        o = {'agent': r['agent']}
        for k in ('points', 'points_week', 'sthhc_apps', 'sthhc_apps_q', 'sthhc_prem', 'sthhc_prem_scored',
                  'sthhc_pts', 'hi_apps', 'hi_prem', 'hi_pts'):
            v = float(r[k] or 0)
            o[k] = int(round(v)) if k in PC_INT else v
        out.append(o)
    return {'generated_at': stamp(now), 'rows': out}


# ----------------------------------------------------------------- main ----

def main():
    args = sys.argv[1:]
    if len(args) < 2 or args[0] not in ('sql', 'run'):
        sys.exit(__doc__)
    cmd, kind = args[0], args[1]
    now = utcnow(args)
    if cmd == 'sql':
        today = dt.date.fromisoformat(args[args.index('--today') + 1]) if '--today' in args else None
        if kind == 'scoreboard' and today is None and '--force' not in args and os.environ.get('GHE_BOARD_KEY'):
            try:  # a refresh already landed in the last 5 minutes -> nothing to do
                age = (utcnow([]) - dt.datetime.strptime(live_snapshot()['generated_at'], '%Y-%m-%dT%H:%M:%SZ')).total_seconds()
                if age < 300:
                    print(f'SKIP: scoreboard refreshed {int(age)}s ago -- end the turn, do not run the query')
                    return
            except (SystemExit, Exception):
                pass  # can't tell -> just refresh
        print({'scoreboard': lambda: sql_scoreboard(today), 'aep': sql_aep, 'paperchase': sql_paperchase}[kind]())
        return
    url = args[2]
    dry = '--dry-run' in args
    rows = fetch_csv(url)
    if kind == 'scoreboard':
        live = live_snapshot()
        snap = build_scoreboard(rows, now, live)
        summary = scoreboard_summary(snap, live)
        path = '/ingest'
    elif kind == 'aep':
        snap = build_aep(rows, now)
        summary = f"rows={len(snap['rows'])} total={sum(r['booked'] for r in snap['rows'])}"
        path = '/ingest/aep'
    elif kind == 'paperchase':
        snap = build_paperchase(rows, now)
        summary = f"rows={len(snap['rows'])} top={snap['rows'][0]['agent'] if snap['rows'] else '-'}"
        path = '/ingest/paperchase'
    else:
        sys.exit('unknown kind')
    if kind == 'paperchase' and dt.date.fromisoformat(CFG['paperchase']['to']) < hst_today(now):
        WARNINGS.append(f"Paper Chase window ended {CFG['paperchase']['to']} (ops/config.json)")
    if kind == 'aep' and dt.date.fromisoformat(CFG['aep']['window']['to']) < hst_today(now):
        WARNINGS.append(f"AEP window ended {CFG['aep']['window']['to']} (ops/config.json)")
    if WARNINGS:
        summary += ' | WARN: ' + '; '.join(WARNINGS)
    if '--out' in args:
        json.dump(snap, open(args[args.index('--out') + 1], 'w'), ensure_ascii=False, indent=1)
    if dry:
        print(f'DRY-RUN {kind}: {summary}')
        return
    resp = post(path, snap)
    print(f'{kind} OK {resp.strip()} | {summary}')


if __name__ == '__main__':
    main()
