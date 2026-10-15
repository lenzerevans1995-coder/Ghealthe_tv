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


def count(sheets, tabs):
    reps = collections.defaultdict(lambda: dict.fromkeys(COLS, 0))
    nobody = dict.fromkeys(COLS, 0)
    fulls = {}
    report = {'tabs': tabs, 'rows_read': 0, 'rows_all_blank': 0, 'rows_no_rep': 0, 'bad_values': []}
    for tab in tabs:
        sh = sheets[tab]
        hdr = sh['rows'][0]
        idx = [hdr.index(c) for c in COLS]
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
            name = canon(r[0])
            fn = full_name(r[0]) if name else None
            if fn and len(fn) > len(fulls.get(name, '')):
                fulls[name] = fn
            bucket = reps[name] if name else nobody
            if not name:
                report['rows_no_rep'] += 1
            for col, v in zip(COLS, vals):
                k = v.lower()
                if k in YES:
                    bucket[col] += 1
                elif k not in NO:
                    report['bad_values'].append({'tab': tab, 'row': i, 'column': col, 'value': v})
        if lines != sh['declared']:
            sys.exit(f'{tab}: read {lines} of {sh["declared"]} rows; the read is partial, not building a board')
    floor = {c: sum(b[c] for b in reps.values()) + nobody[c] for c in COLS}
    shown = {k: fulls.get(k, k) for k in reps}
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
