import assert from 'node:assert/strict';
import { test, mock } from 'node:test';

// A stand-in database that records what would be written and serves rows for reads.
let writes: { values: any; conflict: any }[] = [];
let usageRows: any[] = [];
let submissionRows: any[] = [];
let fail = false;
let waitingN = 0;
const db = {
  insert: () => ({
    values: (values: any) => ({
      onConflictDoUpdate: async (conflict: any) => { if (fail) throw new Error('down'); writes.push({ values, conflict }); },
    }),
  }),
  select: (cols?: any) => ({
    from: () => ({ where: async () => (cols?.n ? [{ n: waitingN }] : cols ? submissionRows : usageRows) }),
  }),
};
mock.module('../db/index.ts', { namedExports: { getDb: () => db } });
mock.module('@anthropic-ai/sdk', {
  defaultExport: class {
    messages = {
      stream() {
        return {
          async *[Symbol.asyncIterator]() { yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '## Done' } }; },
          async finalMessage() { return { stop_reason: 'end_turn', content: [{ type: 'text', text: '## Done' }] }; },
          abort() {},
        };
      },
    };
  },
});

const usage = await import('../netlify/lib/usage.mts');
const { default: track } = await import('../netlify/functions/track.mts');
const { default: stats } = await import('../netlify/functions/stats.mts');
const { default: assistant } = await import('../netlify/functions/assistant.mjs');
Object.assign(globalThis, { Netlify: { env: { get: (k: string) => (k === 'ADMIN_KEY' ? 'test-key' : undefined) } } });

const BROWSER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const send = (body: unknown, ua = BROWSER) => track(new Request('https://example.test/api/track', {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'user-agent': ua, 'content-type': 'text/plain' },
}));

test('days follow Singapore time', () => {
  assert.equal(usage.sgDay(new Date('2026-11-15T15:59:00Z')), '2026-11-15');
  assert.equal(usage.sgDay(new Date('2026-11-15T16:00:00Z')), '2026-11-16');
});

test('only known counters with tidy keys are accepted', () => {
  const events = usage.cleanEvents({ events: [
    { metric: 'pageview', key: 'home' },
    { metric: 'filter', key: 'violence' },
    { metric: 'search' },
    { metric: 'assistant' },                       // only the server counts assistant use
    { metric: 'pageview', key: 'Robert Tan, 81234567' }, // anything that isn't a tidy page key is dropped
  ] });
  assert.deepEqual(events, [
    { metric: 'pageview', key: 'home' }, { metric: 'filter', key: 'violence' }, { metric: 'search', key: '' },
  ]);
  assert.deepEqual(usage.cleanEvents({ events: [{ metric: 'evil', key: 'x' }, { metric: 'visit', key: '' }] }), [{ metric: 'visit', key: '' }]);
  assert.deepEqual(usage.cleanEvents({ events: [{ metric: 'pageview_hour', key: '12' }] }), []);
  assert.equal(usage.cleanEvents({ events: Array(20).fill({ metric: 'search' }) }).length, usage.MAX_EVENTS);
  assert.deepEqual(usage.cleanEvents(null), []);
});

test('the tracker stores counts only, and folds repeats into one +n', async () => {
  writes = [];
  const res = await send({ events: [{ metric: 'pageview', key: 'help:legal-help' }, { metric: 'search' }, { metric: 'search' }] });
  assert.equal(res.status, 204);
  assert.equal(writes.length, 3);
  assert.equal(writes.find(w => w.values.metric === 'pageview_hour')?.values.count, 1);
  const search = writes.find(w => w.values.metric === 'search')!;
  assert.equal(search.values.count, 2);
  assert.deepEqual(Object.keys(search.values).sort(), ['count', 'day', 'key', 'metric', 'source']);
  assert.equal(search.values.source, 'web');
  assert.ok(search.conflict.target && search.conflict.set.count, 'adds to the existing daily counter');
});

test('only approved search topic ids are stored, with blank keys supported for older clients', async () => {
  writes = [];
  const result = await send({ events: [
    { metric: 'search', key: 'financial', query: 'must not be stored' },
    { metric: 'search_no_results', key: 'financial' },
    { metric: 'search', key: 'a-person-name' },
    { metric: 'search_no_results', key: 'constructor' },
    { metric: 'search' },
  ] });
  assert.equal(result.status, 204);
  assert.deepEqual(writes.map(({ values }) => [values.metric, values.key, values.count]), [
    ['search', 'financial', 1], ['search_no_results', 'financial', 1], ['search', '', 1],
  ]);
  assert.ok(writes.every(({ values }) => !Object.hasOwn(values, 'query')));
});

test('page views share a Singapore hour counter without storing page names in it', async () => {
  const events = usage.cleanEvents({ events: [
    { metric: 'pageview', key: 'home' }, { metric: 'pageview', key: 'jobs' }, { metric: 'search' },
  ] });
  writes = [];
  await usage.recordUsage(db, events, 'web', new Date('2026-11-15T15:59:00Z'));
  await usage.recordUsage(db, events, 'web', new Date('2026-11-15T16:00:00Z'));
  assert.deepEqual(writes.map(w => w.values).filter(row => row.metric === 'pageview_hour'), [
    { day: '2026-11-15', source: 'web', metric: 'pageview_hour', key: '23', count: 2 },
    { day: '2026-11-16', source: 'web', metric: 'pageview_hour', key: '00', count: 2 },
  ]);
});

test('search engines and link previews are not counted', async () => {
  writes = [];
  for (const ua of ['Googlebot/2.1', 'LinkedInBot/1.0', 'WhatsApp/2.23', '']) await send({ events: [{ metric: 'pageview', key: 'home' }] }, ua);
  assert.equal(writes.length, 0);
});

test('bad requests and database trouble never break the site', async () => {
  assert.equal((await send('not json')).status, 400);
  fail = true;
  assert.equal((await send({ events: [{ metric: 'visit' }] })).status, 204);
  fail = false;
  assert.equal((await track(new Request('https://example.test/api/track'))).status, 405);
});

test('each assistant use is counted on the server, without the case', async () => {
  writes = [];
  const res = await assistant(new Request('https://example.test/api/assistant', {
    method: 'POST', body: JSON.stringify({ caseText: 'An adult needs support with family conflict and debt.' }),
  }), { waitUntil: () => {} } as any);
  await res.text();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].values.metric, 'assistant');
  assert.ok(!JSON.stringify(writes[0].values).includes('family conflict'), 'case text is never stored');
});

test('requests the assistant turns away are not counted', async () => {
  writes = [];
  await assistant(new Request('https://example.test/api/assistant', { method: 'POST', body: JSON.stringify({ caseText: 'short' }) }), {} as any);
  assert.equal(writes.length, 0);
});

test('periods line up: current ends today, previous is the same length just before', () => {
  const p = usage.periodFor(7, '2026-11-15');
  assert.deepEqual(p, { days: 7, from: '2026-11-09', to: '2026-11-15', prevFrom: '2026-11-02', prevTo: '2026-11-08', monthFrom: '2026-11-01', readFrom: '2026-11-01' });
  assert.equal(usage.periodFor(30, '2026-11-15').readFrom, '2026-09-17', 'reads back far enough for the previous period too');
});

test('summary adds up totals, the previous period, daily rows, pages and filters', () => {
  const p = usage.periodFor(7, '2026-11-15');
  const rows = [
    { day: '2026-11-15', source: 'web', metric: 'visit', key: '', count: 5 },
    { day: '2026-11-14', source: 'web', metric: 'visit', key: '', count: 3 },
    { day: '2026-11-15', source: 'web', metric: 'pageview', key: 'home', count: 7 },
    { day: '2026-11-15', source: 'web', metric: 'pageview', key: 'help:legal-help', count: 2 },
    { day: '2026-11-14', source: 'web', metric: 'filter', key: 'violence', count: 4 },
    { day: '2026-11-15', source: 'web', metric: 'assistant', key: '', count: 6 },
    { day: '2026-11-05', source: 'web', metric: 'visit', key: '', count: 10 }, // previous period
    { day: '2026-10-01', source: 'web', metric: 'visit', key: '', count: 99 }, // too old, ignored
  ];
  const subs = [
    { created_at: '2026-11-15T03:00:00Z', kind: 'recommend' },
    { created_at: '2026-11-08T16:30:00Z', kind: 'update' }, // still 8 Nov in UTC, but 12:30am on 9 Nov in Singapore: current period
    { created_at: '2026-11-03T01:00:00Z', kind: 'update' }, // previous period
  ];
  const s = usage.summarise(rows, subs, p);
  assert.deepEqual(s.totals, { visits: 8, pageviews: 9, searches: 0, noResults: 0, assistant: 6, submissions: 2, profiles: 0, profileShown: 0, profileSkips: 0, visitorDays: 0, newVisitors: 0, assistantCapped: 0, jobsAssistant: 0, jobsAssistantCapped: 0 });
  assert.deepEqual(s.submissionsByKind, { recommend: 1, update: 1 });
  assert.equal(s.previous.visits, 10);
  assert.equal(s.previous.submissions, 1);
  assert.equal(s.daily.length, 7);
  assert.equal(s.daily.at(-1)!.visits, 5);
  assert.equal(s.daily[0].submissions, 1); // 9 Nov
  assert.deepEqual(s.pages, [{ key: 'home', count: 7 }, { key: 'help:legal-help', count: 2 }]);
  assert.deepEqual(s.filters, [{ key: 'violence', count: 4 }]);
});

test('the numbers need the admin key', async () => {
  assert.equal((await stats(new Request('https://example.test/api/stats'))).status, 401);
  assert.equal((await stats(new Request('https://example.test/api/stats', { headers: { 'x-admin-key': 'wrong' } }))).status, 401);
});

test('the dashboard gets a full summary for 7, 30 or 90 days', async () => {
  const period = usage.periodFor(7);
  usageRows = [
    { day: period.to, source: 'web', metric: 'visit', key: '', count: 12 },
    { day: period.to, source: 'web', metric: 'pageview', key: 'home', count: 4 },
    { day: period.to, source: 'web', metric: 'pageview_hour', key: '08', count: 4 },
    { day: period.from, source: 'web', metric: 'pageview_hour', key: '08', count: 3 },
    { day: period.prevTo, source: 'web', metric: 'pageview_hour', key: '08', count: 10 },
    { day: period.to, source: 'web', metric: 'search', key: 'financial', count: 5 },
    { day: period.from, source: 'web', metric: 'search', key: 'financial', count: 1 },
    { day: period.from, source: 'web', metric: 'search_no_results', key: 'financial', count: 2 },
    { day: period.to, source: 'web', metric: 'search', key: 'unclassified', count: 10 },
    { day: period.to, source: 'web', metric: 'search', key: '', count: 20 },
    { day: period.prevTo, source: 'web', metric: 'search', key: 'financial', count: 3 },
  ];
  submissionRows = [];
  const get = async (q: string) => (await stats(new Request(`https://example.test/api/stats${q}`, { headers: { 'x-admin-key': 'test-key' } }))).json();
  const s = await get('?days=7');
  assert.equal(s.range.days, 7);
  assert.equal(s.daily.length, 7);
  assert.equal(s.totals.visits, 12);
  assert.equal(s.totals.pageviews, 4);
  assert.equal(s.totals.searches, 36);
  assert.equal(s.previous.searches, 3);
  assert.deepEqual(s.searchTopics, [
    { key: 'financial', label: 'Financial, food & housing support', searches: 6, noResults: 2 },
    { key: 'unclassified', label: 'Unclassified', searches: 10, noResults: 0 },
  ]);
  assert.deepEqual(s.pageviewsByHour, Array.from({ length: 24 }, (_, hour) => ({ hour, count: hour === 8 ? 7 : 0 })));
  const longer = await get('?days=90');
  assert.equal(longer.pageviewsByHour[8].count, 17);
  assert.equal(longer.searchTopics[0].searches, 9);
  assert.equal((await get('?days=365')).range.days, 30, 'unknown periods fall back to 30 days');
});

test('pop-up answers must come from the fixed lists', () => {
  const ok = usage.cleanEvents({ events: [
    { metric: 'profile', key: 'counsellor:fsc' },
    { metric: 'profile_shown' },
    { metric: 'profile_skip' },
    { metric: 'assistant_role', key: 'social-worker' },
  ] });
  assert.equal(ok.length, 4);
  const bad = usage.cleanEvents({ events: [
    { metric: 'profile', key: 'ceo:fsc' },            // not a listed role
    { metric: 'profile', key: 'counsellor:my-agency' }, // not a listed workplace type
    { metric: 'profile', key: 'counsellor:fsc:extra' },
    { metric: 'assistant_role', key: 'boss' },
    { metric: 'profile_shown', key: 'something' },
  ] });
  assert.deepEqual(bad, []);
});

test('the pop-up offers exactly the options the server accepts', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../public/profile.js', import.meta.url), 'utf8');
  const list = (name: string) => Function(`return ${src.match(new RegExp(`var ${name} = (\\[[\\s\\S]*?\\]);`))![1]}`)() as [string, string][];
  assert.deepEqual(Object.fromEntries(list('ROLES')), usage.ROLES);
  assert.deepEqual(Object.fromEntries(list('AGENCIES')), usage.AGENCIES);
});

test('summary breaks answers down by role, workplace and assistant use', () => {
  const p = usage.periodFor(7, '2026-11-15');
  const r = (metric: string, key: string, count: number) => ({ day: '2026-11-15', source: 'web', metric, key, count });
  const s = usage.summarise([
    r('profile_shown', '', 10), r('profile_skip', '', 2),
    r('profile', 'counsellor:fsc', 3), r('profile', 'counsellor:hospital', 1), r('profile', 'social-worker:fsc', 2),
    r('assistant_role', 'counsellor', 5),
  ], [], p);
  assert.equal(s.audience.responses, 6);
  assert.equal(s.audience.shown, 10);
  assert.equal(s.audience.responseRate, 60);
  assert.deepEqual(s.audience.roles.map(x => [x.label, x.count]), [['Counsellor', 4], ['Social worker', 2]]);
  assert.deepEqual(s.audience.agencies.map(x => [x.label, x.count]), [['Family Service Centre', 5], ['Hospital or healthcare', 1]]);
  assert.deepEqual(s.audience.assistantByRole.map(x => [x.label, x.count]), [['Counsellor', 5]]);
  assert.deepEqual(s.audience.combos[0], { role: 'Counsellor', agency: 'Family Service Centre', count: 3 });
});

test('the dashboard also gets how many submissions are waiting for review', async () => {
  usageRows = []; submissionRows = []; waitingN = 4;
  const res = await stats(new Request('https://example.test/api/stats?days=7', { headers: { 'x-admin-key': 'test-key' } }));
  const s = await res.json();
  assert.equal(s.waitingReview, 4);
  assert.deepEqual(s.submissionsByKind, { recommend: 0, update: 0 });
  waitingN = 0;
});

// ---------- unique visitors, countries and the assistant's daily limit ----------

test('visitor counters come from the browser with no key; country and limit counts only from the server', () => {
  assert.deepEqual(usage.cleanEvents({ events: [
    { metric: 'visitor_day' }, { metric: 'visitor_new' }, { metric: 'visitor_month' },
    { metric: 'visitor_day', key: 'someone' },   // no keys allowed on visitor counts
    { metric: 'country', key: 'sg' },            // the browser can't claim a country
  ] }), [{ metric: 'visitor_day', key: '' }, { metric: 'visitor_new', key: '' }, { metric: 'visitor_month', key: '' }]);
  assert.deepEqual(usage.cleanEvents({ events: [{ metric: 'assistant_capped' }] }), []);
});

test('only a two-letter country is kept', () => {
  assert.equal(usage.countryKey('SG'), 'sg');
  assert.equal(usage.countryKey(undefined), 'xx');
  assert.equal(usage.countryKey('1.2.3.4'), 'xx');
  assert.equal(usage.countryKey('Singapore'), 'xx');
});

test('a visit also counts its country, from Netlify, and nothing finer', async () => {
  writes = [];
  const req = () => new Request('https://example.test/api/track', { method: 'POST', body: JSON.stringify({ events: [{ metric: 'visit' }, { metric: 'pageview', key: 'home' }] }), headers: { 'user-agent': BROWSER } });
  await track(req(), { geo: { country: { code: 'SG', name: 'Singapore' }, city: 'Singapore', latitude: 1.3 }, ip: '203.0.113.7' } as any);
  const c = writes.find(w => w.values.metric === 'country')!;
  assert.equal(c.values.key, 'sg');
  const stored = JSON.stringify(writes.map(w => w.values));
  assert.ok(!stored.includes('203.0.113.7') && !stored.includes('1.3') && !stored.includes('Singapore'), 'no IP or location stored');
  writes = [];
  await track(req(), {} as any);
  assert.equal(writes.find(w => w.values.metric === 'country')!.values.key, 'xx');
  writes = [];
  await send({ events: [{ metric: 'pageview', key: 'home' }] });
  assert.equal(writes.filter(w => w.values.metric === 'country').length, 0, 'page views alone do not count a country');
});

test('the daily limit reads ASSISTANT_DAILY_CAP, with 150 as the default and 0 to switch it off', () => {
  assert.equal(usage.assistantDailyCap(undefined), 150);
  assert.equal(usage.assistantDailyCap(''), 150);
  assert.equal(usage.assistantDailyCap('40'), 40);
  assert.equal(usage.assistantDailyCap('0'), 0);
  assert.equal(usage.assistantDailyCap('lots'), 150);
  assert.equal(usage.assistantDailyCap('-5'), 150);
});

test('once the daily limit is reached, the assistant says so and counts the turn-away', async () => {
  const ask = () => assistant(new Request('https://example.test/api/assistant', {
    method: 'POST', body: JSON.stringify({ caseText: 'An adult needs support with family conflict and debt.' }),
  }), { waitUntil: () => {} } as any);
  process.env.ASSISTANT_DAILY_CAP = '3';
  try {
    writes = []; waitingN = 3; // the stand-in database says 3 uses today
    const res = await ask();
    assert.equal(res.status, 429);
    assert.match((await res.json()).error, /today's limit/);
    await new Promise(r => setTimeout(r, 10));
    assert.deepEqual(writes.map(w => w.values.metric), ['assistant_capped']);

    writes = []; waitingN = 2; // one left
    const ok = await ask(); await ok.text();
    assert.equal(ok.status, 200);

    writes = []; fail = true; waitingN = 3; // if the count can't be read, the assistant stays open
    const db2 = (await import('../db/index.ts')).getDb();
    const orig = db2.select; (db2 as any).select = () => { throw new Error('down'); };
    try { const open = await ask(); await open.text(); assert.equal(open.status, 200); } finally { (db2 as any).select = orig; fail = false; }

    process.env.ASSISTANT_DAILY_CAP = '0'; waitingN = 999;
    const off = await ask(); await off.text();
    assert.equal(off.status, 200, '0 switches the limit off');
  } finally { delete process.env.ASSISTANT_DAILY_CAP; waitingN = 0; }
});

test('summary works out unique visitors, new and returning, and visits by country', () => {
  const p = usage.periodFor(7, '2026-11-15');
  const rows = [
    { day: '2026-11-15', source: 'web', metric: 'visitor_day', key: '', count: 9 },
    { day: '2026-11-14', source: 'web', metric: 'visitor_day', key: '', count: 5 },
    { day: '2026-11-15', source: 'web', metric: 'visitor_new', key: '', count: 4 },
    { day: '2026-11-03', source: 'web', metric: 'visitor_month', key: '', count: 20 }, // earlier this month, outside the 7 days
    { day: '2026-11-15', source: 'web', metric: 'visitor_month', key: '', count: 2 },
    { day: '2026-10-30', source: 'web', metric: 'visitor_month', key: '', count: 50 }, // last month: not this month's total
    { day: '2026-11-15', source: 'web', metric: 'country', key: 'sg', count: 7 },
    { day: '2026-11-14', source: 'web', metric: 'country', key: 'my', count: 1 },
    { day: '2026-11-14', source: 'web', metric: 'country', key: 'sg', count: 2 },
    { day: '2026-11-15', source: 'web', metric: 'assistant_capped', key: '', count: 3 },
  ];
  const s = usage.summarise(rows, [], p);
  assert.deepEqual(s.visitors, { thisMonth: 22, monthFrom: '2026-11-01', newInPeriod: 4, returningDays: 10, averagePerDay: 2 });
  assert.deepEqual(s.countries, [{ key: 'sg', count: 9 }, { key: 'my', count: 1 }]);
  assert.equal(s.totals.assistantCapped, 3);
  assert.equal(s.daily.at(-1)!.visitorDays, 9);
});

test('the dashboard shows the assistant limit and how much of it is used today', async () => {
  process.env.ASSISTANT_DAILY_CAP = '80';
  try {
    usageRows = [{ day: usage.sgDay(), source: 'web', metric: 'assistant', key: '', count: 12 }];
    submissionRows = [];
    const s = await (await stats(new Request('https://example.test/api/stats?days=7', { headers: { 'x-admin-key': 'test-key' } }))).json();
    assert.deepEqual(s.assistantCap, { limit: 80, usedToday: 12 });
  } finally { delete process.env.ASSISTANT_DAILY_CAP; }
});
