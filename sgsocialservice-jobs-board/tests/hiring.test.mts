import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { addDays, checkEmployers, filterEmployers, liveEmployers } from '../netlify/lib/hiring.mts';
import { buildSystem } from '../netlify/lib/jobs-assistant.mts';

const file = JSON.parse(readFileSync(new URL('../content/hiring-now.json', import.meta.url), 'utf8'));
const entry = (o: object = {}) => ({ id: 'x-org', name: 'X Org', org_type: 'charity', url: 'https://x.org/careers', summary: 'Does good.', roles: ['Social Worker'], areas: ['social-work'], checked: '2026-11-24', ...o });

test('the hiring-now file is valid', () => {
  const { employers, problems } = checkEmployers(file);
  assert.deepEqual(problems, []);
  assert.ok(employers.length >= 5);
  assert.ok(employers.every(e => e.url.startsWith('https://')));
});

test('mistakes in the file are reported clearly and the entry is left out', () => {
  const { employers, problems } = checkEmployers({ employers: [
    entry(), entry(),
    entry({ id: 'Bad Id', org_type: 'hospital', url: 'http://x.org', areas: ['nursing'], checked: '24 Nov 2026' }),
  ] });
  assert.equal(employers.length, 1);
  assert.match(problems[0], /Entry 2 \(X Org\): id "x-org" is used twice/);
  assert.match(problems[1], /id must be lowercase.*org_type must be one of.*url must start with https.*areas must use.*checked must be a date/);
  assert.deepEqual(checkEmployers({}).problems, ['The file needs an "employers" list.']);
});

test('cards hide 120 days after they were last checked', () => {
  const raw = { employers: [entry()] };
  assert.equal(addDays('2026-11-24', 120), '2027-03-24');
  assert.equal(liveEmployers('2027-03-24', raw).length, 1);
  assert.equal(liveEmployers('2027-03-25', raw).length, 0);
  assert.equal(liveEmployers('2026-11-23', raw).length, 0, 'a future check date is a typo, not a live card');
});

test('employer cards follow the board filters, the same way in the browser', () => {
  const list = checkEmployers(file).employers;
  const ctx: any = {};
  runInNewContext(readFileSync(new URL('../public/jobs/jobs.js', import.meta.url), 'utf8'), { globalThis: ctx, window: undefined });
  const client = ctx.SGSSJobs;
  for (const f of [{}, { orgType: ['healthcare'] }, { nature: ['special-needs'] }, { q: 'dementia' }, { orgType: ['government'], nature: ['counselling'] }]) {
    const server = filterEmployers(list, f).map(e => e.id);
    assert.deepEqual(Array.from(client.filterEmployers(list, f), (e: any) => e.id), server);
  }
  assert.deepEqual(filterEmployers(list, { orgType: ['healthcare'] }).map(e => e.id), ['singhealth']);
  const html = client.employerCard({ ...list[0], name: '<b>x</b>', url: 'https://e.org/"q' }, { orgTypes: [{ id: 'charity', label: 'Charity & foundations' }] });
  assert.ok(!html.includes('<b>x</b>'));
  assert.match(html, /href="https:\/\/e\.org\/&quot;q" target="_blank" rel="noopener noreferrer">See openings/);
});

test('the jobs assistant can suggest these organisations without inventing openings', () => {
  const s = buildSystem({ jobs: [], total: 0, base: 'https://site.sg', today: '2026-11-24', employers: liveEmployers('2026-11-24') });
  assert.match(s, /HIRING NOW/);
  assert.match(s, /careers page: https:\/\/dementia\.org\.sg\/career\//);
  assert.match(s, /never present one of their roles as a confirmed opening/);
  assert.match(s, /## Also hiring on their own sites/);
  assert.match(buildSystem({ jobs: [], total: 0, base: 'https://site.sg', today: '2026-11-24' }), /\(none listed right now\)/);
});
