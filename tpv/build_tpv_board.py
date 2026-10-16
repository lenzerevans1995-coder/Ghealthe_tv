"""Build the TPV floor TV board from a TPV Tracker read.

Input is the text the Microsoft 365 connector returns for TPV Tracker.xlsx
(read_resource on the workbook's file:/// URI): one "## Sheet: <name> — N rows"
block per tab, tab-separated rows. That export carries client names and phone
numbers, so keep it out of the repo (tpv/.gitignore) and pass its path in.

    python3 -I tpv/build_tpv_board.py --tracker tpv/input/tracker.txt \
        --date 2026-10-15 --out tpv/boards/2026-10-15

Writes tpv_tv_board_<date>.html (render it with tpv/render.mjs) and prints a
JSON report: tabs used, rows read, floor totals, rows with no Benefit Rep, and
any cell outside the Y / N vocabulary. Exits non-zero, writing nothing, when a
tab reads short of its declared size: a board on partial data must not ship.

Only the numbers, the header window and the rail change; template.html's CSS,
palette, layout and ask band are copied through untouched.
"""
import argparse
import collections
import datetime
import json
import os
import re
import sys

COLS = ['TPV', 'HRA', 'Mail-Order', 'Video', 'IHWV']
YES = {'y', 'yes'}
NO = {'n', 'no', 'n/a', 'na', ''}
MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']


def read_sheets(path):
    sheets, cur = {}, None
    for ln in open(path, encoding='utf-8').read().split('\n'):
        m = re.match(r'## Sheet: (.*?) — (\d+) rows', ln)
        if m:
            cur = m.group(1)
            sheets[cur] = {'declared': int(m.group(2)), 'rows': []}
            continue
        if cur and ln != '':
            sheets[cur]['rows'].append(ln.split('\t'))
    return sheets


def empty_marker(cell):
    m = re.fullmatch(r'\[(\d+) empty rows?\]', cell.strip())
    return int(m.group(1)) if m else 0


def month_tabs(sheets, day):
    """Tabs for the board's month: named for it, holding a TPV column, and not
    a later month's placeholder. Earlier months' tabs overlap and would double
    count, so they are never summed in."""
    abbr = MONTH_ABBR[day.month - 1]
    return [name for name, sh in sheets.items()
            if re.match(rf'{abbr}[a-z]*\b', name.strip(), re.I)
            and sh['rows'] and 'TPV' in sh['rows'][0]]


EMOJI = re.compile('[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0E\uFE0F\u200D\u20E3]')


def full_name(raw):
    """The rep's name as written on the row, cleaned: emojis stripped, spaces
    collapsed. Only a multi-word name counts as a full name."""
    s = re.sub(r'\s+', ' ', EMOJI.sub('', raw)).strip()
    return s if ' ' in s else None


def canon(raw):
    """One name per rep. The AEP tabs use full names and the earlier ones
    first names, so a rep is their first name, with the known spellings
    collapsed."""
    s = re.sub(r'\s+', ' ', raw.strip())
    if not s:
        return None
    first = s.split(' ')[0].lower()
    if re.fullmatch(r'(jamie|jaime|jaimie)(\(jaime\))?', first):
        return 'Jaime'
    if first in ('jeahne', 'jeahne-renee'):
        return 'Jeahne-Renee'
    return first.capitalize()


def norm_code(s):
    return re.sub(r'[\s.]', '', s or '').upper()


def norm_phone(s):
    d = re.sub(r'\D', '', s or '')
    return d[-10:] if len(d) >= 7 else ''


def norm_client(s):
    return re.sub(r'[^a-z]', '', (s or '').lower())


def same_enrollment(a, b):
    """Two rows with one SunFire code are the same verification when they are
    the same client: matching phone, matching name, or one row too bare to
    tell. Different clients under one mistyped code stay separate."""
    if not a['phone'] or not b['phone']:
        return True
    return a['phone'] == b['phone'] or (a['client'] and a['client'] == b['client'])


def count(sheets, tabs):
    """Rows are read in sheet order. A rep is their first name (spellings
    collapsed) plus their last name where the row gives one, so two reps who
    share a first name stay apart; a first-name-only row joins the one rep with
    that first name. A repeated enrollment counts once, credited where it was
    first logged."""
    report = {'tabs': tabs, 'rows_read': 0, 'rows_all_blank': 0, 'rows_no_rep': 0,
              'bad_values': [], 'duplicates': [], 'reps_with_no_counts': []}
    rows = []
    for tab in tabs:
        sh = sheets[tab]
        hdr = sh['rows'][0]
        idx = [hdr.index(c) for c in COLS]
        col = lambda pred: next((j for j, h in enumerate(hdr) if pred(h.strip().lower())), None)
        code_col = col(lambda h: h.startswith('sunfire'))
        phone_col = col(lambda h: h == 'phone')
        client_col = col(lambda h: h.startswith('client'))
        lines = 1  # the header
        for i, r in enumerate(sh['rows'][1:], start=2):
            skipped = empty_marker(r[0]) if len(r) == 1 else 0
            if skipped:
                lines += skipped
                continue
            lines += 1
            report['rows_read'] += 1
            r = r + [''] * (len(hdr) - len(r))
            vals = [r[j].strip() for j in idx]
            if all(v == '' for v in vals):
                report['rows_all_blank'] += 1
                continue
            first = canon(r[0])
            fn = full_name(r[0]) if first else None
            rows.append({
                'tab': tab, 'row': i, 'vals': vals, 'first': first, 'full': fn,
                'last': fn.split(' ')[-1].lower() if fn else None,
                'code': norm_code(r[code_col]) if code_col is not None else '',
                'phone': norm_phone(r[phone_col]) if phone_col is not None else '',
                'client': norm_client(r[client_col]) if client_col is not None else '',
            })
        if lines != sh['declared']:
            sys.exit(f'{tab}: read {lines} of {sh["declared"]} rows; the read is partial, not building a board')

    lasts = collections.defaultdict(set)
    for x in rows:
        if x['first'] and x['last']:
            lasts[x['first']].add(x['last'])
    for x in rows:
        if x['first'] and not x['last'] and len(lasts[x['first']]) == 1:
            x['last'] = next(iter(lasts[x['first']]))
        x['key'] = (x['first'], x['last']) if x['first'] else None

    # Group repeats of one enrollment, then count each group once: credited to
    # the first row in it that names a rep (a copy logged without a name must
    # not take the credit from the row that has one).
    groups, by_code = [], collections.defaultdict(list)
    for x in rows:
        g = next((g for g in by_code[x['code']] if same_enrollment(g[0], x)), None) if x['code'] else None
        if g is None:
            g = [x]
            groups.append(g)
            if x['code']:
                by_code[x['code']].append(g)
        else:
            g.append(x)

    reps = collections.defaultdict(lambda: dict.fromkeys(COLS, 0))
    nobody = dict.fromkeys(COLS, 0)
    fulls = {}
    for x in rows:
        if x['key'] and x['full'] and len(x['full']) > len(fulls.get(x['key'], '')):
            fulls[x['key']] = x['full']
    for g in groups:
        x = next((y for y in g if y['key']), g[0])
        for y in g:
            if y is not x:
                report['duplicates'].append({
                    'tab': y['tab'], 'row': y['row'], 'code': y['code'],
                    'counted_at': f"{x['tab']} row {x['row']}", 'other_rep': y['key'] != x['key'],
                })
        key = x['key']
        bucket = reps[key] if key else nobody
        if not key:
            report['rows_no_rep'] += 1
        for c, v in zip(COLS, x['vals']):
            k = v.lower()
            if k in YES:
                bucket[c] += 1
            elif k not in NO:
                report['bad_values'].append({'tab': x['tab'], 'row': x['row'], 'column': c, 'value': v})

    # A name with nothing counted (say an agent typed into the rep column on a
    # row with N everywhere) adds nothing to the floor; keep it off the board.
    for key in [k for k, v in reps.items() if not any(v.values())]:
        report['reps_with_no_counts'].append(fulls.get(key, key[0]))
        del reps[key]
    floor = {c: sum(b[c] for b in reps.values()) + nobody[c] for c in COLS}
    shown = {k: fulls.get(k, k[0]) for k in reps}
    ranked = sorted(((shown[k], v) for k, v in reps.items()), key=lambda kv: (-kv[1]['TPV'], kv[0]))
    return ranked, nobody, floor, report


def selling_days(day):
    return sum(1 for d in range(1, day.day + 1)
               if datetime.date(day.year, day.month, d).weekday() < 5)


def build(template, ranked, nobody, floor, day):
    def cell(n):
        return '<td class="n0">0</td>' if n == 0 else f'<td>{n}</td>'

    rows = [f'        <tr><td>{name}</td>' + ''.join(cell(v[c]) for c in COLS) + '</tr>'
            for name, v in ranked]
    rows.append('        <tr class="uncredited"><td>No name on the row</td>'
                f'<td>{nobody["TPV"]}</td><td>{nobody["HRA"]}</td>'
                '<td>&mdash;</td><td>&mdash;</td><td>&mdash;</td></tr>')
    rows.append('        <tr class="total"><td>Floor</td>' + ''.join(f'<td>{floor[c]}</td>' for c in COLS) + '</tr>')

    month = day.strftime('%B')
    hra = round(100 * floor['HRA'] / floor['TPV']) if floor['TPV'] else 0
    per_day = floor['TPV'] / selling_days(day)

    def sub(pattern, repl, text, flags=0):
        out, n = re.subn(pattern, repl, text, flags=flags)
        if n != 1:
            sys.exit(f'template changed shape: {pattern!r} matched {n} times')
        return out

    html = sub(r'(      <tbody>\n).*?(\n      </tbody>)', lambda m: m.group(1) + '\n'.join(rows) + m.group(2),
               template, re.S)
    if len(ranked) > 8:
        html = sub(r'<table>', '<table class="dense">', html)
    html = sub(r'<div class="win">.*?</div>', f'<div class="win">{month} 1&ndash;{day.day} &middot; Benefit Reps</div>', html)
    html = sub(r'(<div class="fig">)\d+(</div>)', lambda m: f'{m.group(1)}{floor["TPV"]}{m.group(2)}', html)
    html = sub(r'(<div class="sub">)[A-Za-z]+ to date(</div>)', lambda m: f'{m.group(1)}{month} to date{m.group(2)}', html)
    html = sub(r'(<span class="k">HRA attached</span><span class="v">)\d+%', lambda m: f'{m.group(1)}{hra}%', html)
    html = sub(r'(<span class="k">Verifications / day</span><span class="v">)[\d.]+',
               lambda m: f'{m.group(1)}{per_day:.1f}', html)
    return html, {'hra_attached_pct': hra, 'selling_days': selling_days(day), 'verifications_per_day': round(per_day, 1)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tracker', required=True, help='connector read of TPV Tracker.xlsx')
    ap.add_argument('--date', required=True, help='board date, YYYY-MM-DD (Eastern)')
    ap.add_argument('--out', required=True, help='output directory')
    ap.add_argument('--template', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'template.html'))
    a = ap.parse_args()

    day = datetime.date.fromisoformat(a.date)
    sheets = read_sheets(a.tracker)
    tabs = month_tabs(sheets, day)
    if not tabs:
        sys.exit(f'no tabs for {day:%B} in the tracker: {list(sheets)}')
    ranked, nobody, floor, report = count(sheets, tabs)
    html, rail = build(open(a.template, encoding='utf-8').read(), ranked, nobody, floor, day)

    os.makedirs(a.out, exist_ok=True)
    path = os.path.join(a.out, f'tpv_tv_board_{day.isoformat()}.html')
    open(path, 'w', encoding='utf-8').write(html)

    # What the Routine POSTs to ghe-board.com/ingest/tpv: per-rep counts only.
    key = {'TPV': 'tpv', 'HRA': 'hra', 'Mail-Order': 'mail', 'Video': 'video', 'IHWV': 'ihwv'}
    payload = {
        'date': day.isoformat(),
        'tabs': tabs,
        'rows_read': report['rows_read'],
        'reps': [{'name': name, **{key[c]: v[c] for c in COLS}} for name, v in ranked],
        'no_rep': {'tpv': nobody['TPV'], 'hra': nobody['HRA']},
        'floor': {key[c]: floor[c] for c in COLS},
    }
    payload_path = os.path.join(a.out, 'payload.json')
    json.dump(payload, open(payload_path, 'w', encoding='utf-8'), indent=1)

    report.update({'floor': floor, 'no_rep': nobody, 'reps': dict(ranked), **rail, 'html': path, 'payload': payload_path})
    print(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
