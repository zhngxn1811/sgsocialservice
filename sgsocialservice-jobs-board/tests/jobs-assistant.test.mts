import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { PublicJob } from '../netlify/lib/jobs.mts';

let replies: { text: string; stop: string }[] = [];
let calls: any[] = [];
mock.module('@anthropic-ai/sdk', {
  defaultExport: class {
    messages = {
      stream(params: any) {
        calls.push(structuredClone(params));
        const reply = replies.shift();
        assert.ok(reply, 'must stop requesting after the answer completes');
        return {
          async *[Symbol.asyncIterator]() { yield { type: 'content_block_delta', delta: { type: 'text_delta', text: reply.text } }; },
          async finalMessage() { return { stop_reason: reply.stop, content: [{ type: 'text', text: reply.text }] }; },
          abort() {},
        };
      },
    };
  },
});

const { buildSystem, pickJobs, profileFrom, validateMessages } = await import('../netlify/lib/jobs-assistant.mts');
const { makeHandler } = await import('../netlify/functions/jobs-assistant.mts');

const j = (o: Partial<PublicJob>): PublicJob => ({
  id: 'x', title: 'Job', org: 'Org', org_type: 'social-community', location: 'Singapore', employment_type: 'Full Time',
  salary_min: null, salary_max: null, salary_type: '', summary: '', qualification: 'bachelors', min_years: 2, fresh_grad: false,
  nature: [], skills: [], apply_url: 'https://www.mycareersfuture.gov.sg/job/x', source_name: 'MyCareersFuture', posted_at: '2026-11-20', closes_at: '2026-12-20', ...o,
});
const JOBS = [
  j({ id: 'senior-sw', title: 'Senior Social Worker', nature: ['social-work'], min_years: 5 }),
  j({ id: 'youth-worker', title: 'Youth Worker', nature: ['youth-work'], min_years: 0, fresh_grad: true, qualification: 'diploma', summary: 'Work with youth at risk in the east.' }),
  j({ id: 'counsellor', title: 'Counsellor (Youth)', nature: ['counselling', 'youth-work'], min_years: 0, fresh_grad: true, summary: 'Counselling for teens.' }),
  j({ id: 'clin-psy', title: 'Clinical Psychologist', nature: ['clinical-psychology'], qualification: 'masters', min_years: 1, org_type: 'healthcare' }),
  j({ id: 'nurse', title: 'Staff Nurse', nature: ['nursing-care'], qualification: 'diploma', org_type: 'healthcare' }),
];
const user = (content: string) => ({ messages: [{ role: 'user', content }] });

test('checks the conversation shape and keeps identifiers out', () => {
  assert.ok('messages' in validateMessages(user('I want a counselling job')));
  assert.match((validateMessages({}) as any).error, /what kind of job/);
  assert.match((validateMessages({ messages: [{ role: 'assistant', content: 'hi' }] }) as any).error, /list of messages/);
  assert.match((validateMessages({ messages: [{ role: 'user', content: 'a b c' }, { role: 'assistant', content: 'ok' }] }) as any).error, /list of messages/);
  assert.match((validateMessages(user('My NRIC is S1234567D')) as any).error, /NRIC/);
  assert.match((validateMessages(user('call me on 9123 4567')) as any).error, /phone/);
  assert.match((validateMessages(user('me@example.com')) as any).error, /email/);
  assert.ok('messages' in validateMessages(user('Salary around $3500 to $4000 a month, 2 years experience')), 'salaries and years are not phone numbers');
  assert.match((validateMessages(user('x'.repeat(8001))) as any).error, /8,000/);
  const long = Array.from({ length: 31 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'hi there' }));
  assert.match((validateMessages({ messages: long }) as any).error, /long/);
});

test('reads qualification, experience and interests from what the person says', () => {
  const p = profileFrom([{ role: 'user', content: 'Final-year psychology student at NTU with a practicum at an FSC. Want counselling or youth work.' }]);
  assert.equal(p.level, 'bachelors');
  assert.equal(p.fresh, true);
  assert.ok(p.natures.includes('counselling') && p.natures.includes('youth-work'));
  assert.ok(p.orgTypes.includes('social-community'));
  const q = profileFrom([{ role: 'user', content: 'Mid-career switcher, 8 years working in banking, Master of Counselling (MGC) done.' }]);
  assert.equal(q.level, 'masters');
  assert.equal(q.years, 8);
  assert.equal(q.fresh, false);
});

test('picks the jobs that fit the conversation first', () => {
  const picked = pickJobs(JOBS, [{ role: 'user', content: 'Fresh grad with a psychology degree, looking for counselling or youth work' }], '2026-11-24', 5);
  assert.deepEqual(picked.map(x => x.id).slice(0, 2), ['counsellor', 'youth-worker']);
  assert.ok(picked.findIndex(x => x.id === 'senior-sw') > 1, 'a senior role needing 5 years ranks below fresh-grad roles');
  const clin = pickJobs(JOBS, [{ role: 'user', content: 'I have a Masters in clinical psychology and want a hospital role' }], '2026-11-24', 1);
  assert.equal(clin[0].id, 'clin-psy');
});

test('the prompt makes it a seasoned recruiter that only recommends listed jobs, with links', () => {
  const s = buildSystem({ jobs: JOBS.slice(0, 2), total: 5, base: 'https://site.sg', today: '2026-11-24' });
  assert.match(s, /recruitment consultant with 30 years of experience/);
  assert.match(s, /students, fresh graduates and mid-career switchers/);
  assert.match(s, /Recommend ONLY jobs from the JOBS list/);
  assert.match(s, /There is no word-count limit/);
  assert.match(s, /\*\*\[Job title, Employer\]\(job page URL\)\*\*/);
  assert.match(s, /job page: https:\/\/site\.sg\/jobs\/senior-sw \| apply: https:\/\/www\.mycareersfuture\.gov\.sg\/job\/x/);
  assert.match(s, /JOBS \(2 of 5 open roles/);
  assert.match(s, /mindline 1771/);
  assert.match(buildSystem({ jobs: [], total: 0, base: 'https://site.sg', today: '2026-11-24' }), /No open jobs are loaded/);
});

const post = (body: unknown, load = async () => JOBS) => makeHandler(load)(new Request('https://site.sg/api/jobs-assistant', { method: 'POST', body: JSON.stringify(body) }), {} as any);

test('streams long answers and keeps going past each chunk limit', async () => {
  replies = [{ text: 'Part one. '.repeat(500), stop: 'max_tokens' }, { text: 'Part two.', stop: 'end_turn' }];
  calls = [];
  const res = await post(user('Fresh grad, want youth work'));
  assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(await res.text(), 'Part one. '.repeat(500) + 'Part two.');
  assert.equal(calls.length, 2);
  assert.match(calls[0].system, /Youth Worker/);
  assert.equal(calls[0].messages[0].content, 'Fresh grad, want youth work');
  assert.match(calls[1].messages.at(-1).content, /Continue the previous response exactly/);
});

test('passes follow-up turns through, and refuses bad requests before calling the model', async () => {
  replies = [{ text: 'Here are fresh grad roles.', stop: 'end_turn' }];
  calls = [];
  const res = await post({ messages: [{ role: 'user', content: 'counselling jobs' }, { role: 'assistant', content: 'Here are some.' }, { role: 'user', content: 'only fresh grads please' }] });
  assert.equal(await res.text(), 'Here are fresh grad roles.');
  assert.equal(calls[0].messages.length, 3);
  calls = [];
  assert.equal((await post(user('my email is a@b.co'))).status, 400);
  assert.equal((await makeHandler()(new Request('https://site.sg/api/jobs-assistant'), {} as any)).status, 405);
  assert.equal((await post(user('counselling jobs please'), async () => { throw new Error('db down'); })).status, 503);
  assert.equal(calls.length, 0);
});
