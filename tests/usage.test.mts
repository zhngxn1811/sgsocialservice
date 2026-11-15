import assert from 'node:assert/strict';
import { test, mock } from 'node:test';

// A stand-in database that records what would be written and serves rows for reads.
let writes: { values: any; conflict: any }[] = [];
let usageRows: any[] = [];
let submissionRows: any[] = [];
let fail = false;
const db = {
  insert: () => ({
    values: (values: any) => ({
      onConflictDoUpdate: async (conflict: any) => { if (fail) throw new Error('down'); writes.push({ values, conflict }); },
    }),
  }),
  select: (cols?: any) => ({
    from: () => ({ where: async () => (cols ? submissionRows : usageRows) }),
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
  assert.equal(usage.cleanEvents({ events: Array(20).fill({ metric: 'search' }) }).length, usage.MAX_EVENTS);
  assert.deepEqual(usage.cleanEvents(null), []);
});

test('the tracker stores counts only, and folds repeats into one +n', async () => {
  writes = [];
  const res = await send({ events: [{ metric: 'pageview', key: 'help:legal-help' }, { metric: 'search' }, { metric: 'search' }] });
  assert.equal(res.status, 204);
  assert.equal(writes.length, 2);
  const search = writes.find(w => w.values.metric === 'search')!;
  assert.equal(search.values.count, 2);
  assert.deepEqual(Object.keys(search.values).sort(), ['count', 'day', 'key', 'metric', 'source']);
  assert.equal(search.values.source, 'web');
  assert.ok(search.conflict.target && search.conflict.set.count, 'adds to the existing daily counter');
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
  assert.deepEqual(p, { days: 7, from: '2026-11-09', to: '2026-11-15', prevFrom: '2026-11-02', prevTo: '2026-11-08' });
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
  assert.deepEqual(s.totals, { visits: 8, pageviews: 9, searches: 0, noResults: 0, assistant: 6, submissions: 2 });
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
  usageRows = [{ day: usage.sgDay(), source: 'web', metric: 'visit', key: '', count: 12 }];
  submissionRows = [];
  const get = async (q: string) => (await stats(new Request(`https://example.test/api/stats${q}`, { headers: { 'x-admin-key': 'test-key' } }))).json();
  const s = await get('?days=7');
  assert.equal(s.range.days, 7);
  assert.equal(s.daily.length, 7);
  assert.equal(s.totals.visits, 12);
  assert.equal((await get('?days=365')).range.days, 30, 'unknown periods fall back to 30 days');
});
