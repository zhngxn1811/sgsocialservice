import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

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

const { CATALOGUE, buildSystem, courseLine, orderCourses, profileFrom, validateMessages } = await import('../netlify/lib/training-assistant.mts');
const { makeHandler } = await import('../netlify/functions/training-assistant.mts');
const TODAY = '2026-11-28';
const user = (content: string) => ({ messages: [{ role: 'user', content }] });

test('checks the conversation and keeps identifiers out', () => {
  assert.ok('messages' in validateMessages(user('I want to learn CBT')));
  assert.match((validateMessages({}) as any).error, /what you'd like to learn/);
  assert.match((validateMessages(user('my NRIC is S1234567D')) as any).error, /NRIC/);
  assert.match((validateMessages(user('reach me at a@b.co')) as any).error, /email/);
  assert.ok('messages' in validateMessages(user('Budget around $500, 3 years in practice')), 'fees and years are not phone numbers');
});

test('reads what the person wants to learn', () => {
  const p = profileFrom([{ role: 'user', content: 'Social worker at an FSC, 3 years in. Want trauma work and later supervision. Need PCG funding and CPD.' }]);
  assert.ok(p.approaches.includes('trauma') && p.approaches.includes('supervision'));
  assert.ok(p.professions.includes('social-workers'));
  assert.equal(p.level, 'advanced');
  assert.ok(p.cheap && p.accreditation);
  const q = profileFrom([{ role: 'user', content: 'Counselling student, new to this, want basic skills online' }]);
  assert.equal(q.level, 'foundation');
  assert.ok(q.online && q.professions.includes('counsellors'));
});

test('puts the best-fitting courses first', () => {
  const play = orderCourses(CATALOGUE.courses, [{ role: 'user', content: 'Psychologist wanting play therapy and Gestalt work with children' }], TODAY);
  assert.ok(play.slice(0, 4).every(c => /play|gestalt/i.test(c.title + c.approaches.join())), play.slice(0, 4).map(c => c.id).join());
  assert.equal(play.length, CATALOGUE.courses.length, 'every course is still sent');
  const sup = orderCourses(CATALOGUE.courses, [{ role: 'user', content: 'Experienced social worker, ready to learn clinical supervision' }], TODAY);
  assert.match(sup[0].id, /supervision/);
});

test('the prompt makes it a seasoned adviser that quotes listed fees, funding and accreditation', () => {
  const asist = CATALOGUE.courses.find(c => c.id === 'sasw-asist')!;
  const line = courseLine(asist, 0);
  assert.match(line, /fees: Employer or self-sponsored \$650; SASW member \$585; After approved PCG claim \$357\.50/);
  assert.match(line, /funding and grants: Professional Capability Grant \(PCG\): For participants employed/);
  assert.match(line, /accreditation: ASIST by LivingWorks/);
  assert.match(line, /course page: https:\/\/sasw\.org\.sg\/programme\/asist-suicide-first-aid/);
  const s = buildSystem({ courses: CATALOGUE.courses, today: TODAY });
  assert.match(s, /senior clinical supervisor and professional development adviser with 30 years of experience/);
  assert.match(s, /Recommend ONLY courses from the COURSES list/);
  assert.match(s, /Quote fees and grant conditions exactly as listed/);
  assert.match(s, /\*\*\[Course title, Provider\]\(course page URL\)\*\*/);
  assert.match(s, /There is no word-count limit/);
  assert.match(s, /mindline 1771/);
  assert.match(s, /TRAINING CALENDARS/);
  assert.match(s, new RegExp(`COURSES \\(${CATALOGUE.courses.length} courses`));
  assert.match(s, /fees: not published/, 'says so when a provider publishes no fees');
});

const post = (body: unknown, load?: () => Promise<any>) => makeHandler(load)(new Request('https://site.sg/api/training-assistant', { method: 'POST', body: JSON.stringify(body) }), {} as any);

test('streams long answers and keeps going past each chunk limit', async () => {
  replies = [{ text: 'Start here. '.repeat(400), stop: 'max_tokens' }, { text: 'Next steps.', stop: 'end_turn' }];
  calls = [];
  const res = await post(user('Counsellor wanting CBT, self-sponsored, 42'));
  assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(await res.text(), 'Start here. '.repeat(400) + 'Next steps.');
  assert.equal(calls.length, 2);
  assert.match(calls[0].system, /Theories and Techniques in Counselling/);
  assert.match(calls[1].messages.at(-1).content, /Continue the previous response exactly/);
});

test('refuses bad requests before calling the model', async () => {
  calls = [];
  assert.equal((await post(user('my email is a@b.co'))).status, 400);
  assert.equal((await makeHandler()(new Request('https://site.sg/api/training-assistant'), {} as any)).status, 405);
  assert.equal((await post(user('CBT courses please'), async () => { throw new Error('gone'); })).status, 503);
  assert.equal(calls.length, 0);
});
