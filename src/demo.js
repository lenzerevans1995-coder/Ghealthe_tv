// Seed snapshot used until the first real ingest arrives. Numbers are the
// Aug 3/4 figures from the hand-built boards, so the rendered output can be
// compared 1:1 against the originals.
export const DEMO_SNAPSHOT = {
  generated_at: '2026-08-04T12:00:00Z',
  board_date: '2026-08-04',
  demo: true,

  month: {
    label: 'August',
    selling_days_total: 21,
    selling_days_done: 1,
    selling_days_left: 20,
    sub: '21 selling days in August<br>1 down · 20 to go, today included',
  },

  focus: {
    kicker: "Today's focus — Short-Term Home Health",
    headline: '2 STHHC each. Every seat on the floor.',
    rules: [
      '<b>This one is for everybody.</b> 34 of us took calls yesterday — 2 apiece is <b>68 on the day</b>. Nobody sits this out.',
      'We wrote <b>3</b> yesterday. July averaged <b>7 a day</b>. This is the easiest gap on the board to close.',
      "<b>Not on the MA call.</b> STHHC can't ride on the same call as an MAPD/MA enrollment — set the callback. HI is fine same-call.",
      '<b>Qualify first:</b> does everything on their own, not getting home health now, not in a facility.',
    ],
    slots: ['1', '2'],
  },

  today: {
    label: 'Tuesday · August 4',
    core: 0, sthhc: 0, hi: 0, ancillary: 0, total: 0,
    calls: 0, conversion: null,
    leaders: [],
  },

  yesterday: {
    label: 'Yesterday — Monday, August 3',
    core: 42, sthhc: 3, hi: 9, ancillary: 78, total: 132,
    subline: [
      '<b>578</b> inbound calls',
      '<b>7.3%</b> core conversion',
      '<b>22</b> agents on the core board',
      '<b>3</b> agents wrote an STHHC',
    ],
    board: [
      { pos: '1', who: 'Savanna Holloway', what: '<b>4</b> core &nbsp;+&nbsp; <b>1</b> sthhc' },
      { pos: '1', who: 'Adam Menendez', what: '<b>4</b> core' },
      { pos: '3', who: 'John Gregory &nbsp;·&nbsp; Jalen McClendon', what: '<b>3</b> core each' },
      { pos: '★', who: 'Raymond Mccrea', what: 'most policies — <b>12</b>' },
    ],
  },

  leaders_sthhc: {
    month_label: 'July 2026',
    eyebrow: 'Short-Term Home Health — Top 5',
    title: "July's STHHC Leaders",
    rows: [
      { pos: '1', who: 'Savanna Holloway', count: 18, avg: '$52' },
      { pos: '2', who: 'Tianna Thompson', count: 11, avg: '$92' },
      { pos: '3', who: "ChenY'ere Franklin", count: 11, avg: '$64' },
      { pos: '4', who: 'Jesenia Morell', count: 11, avg: '$52' },
      { pos: '5', who: 'Juana Bustos-Roblero', count: 10, avg: '$59' },
    ],
    foot: 'Ranked by policies written. Three-way tie at 11 broken by average monthly premium. Floor average: $60.17.',
    floor: [
      { n: '162', l: 'STHHC written', eyebrow: 'Floor — July' },
      { n: '$60', l: 'Avg monthly premium' },
      { n: '$9.7k', l: 'Monthly premium written' },
    ],
    push: {
      headline: 'These 5 wrote 61 of our 162.',
      body: "Just over a third of the floor's STHHC came off five desks. <b>Today everybody writes 2.</b> Not on the MA call — set the callback.",
    },
  },
};
