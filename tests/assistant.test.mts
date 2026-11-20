import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { readFile } from 'node:fs/promises';

const directory = JSON.parse(await readFile(new URL('../public/services.json', import.meta.url), 'utf8'));

let replies: { text: string; stop: string }[] = [];
let calls: any[] = [];
let aborted = false;
mock.module('@anthropic-ai/sdk', {
  defaultExport: class {
    messages = {
      stream(params: any) {
        calls.push(structuredClone(params));
        const reply = replies.shift();
        assert.ok(reply, 'must stop requesting after the answer completes');
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: reply.text } };
          },
          async finalMessage() {
            return { stop_reason: reply.stop, content: [{ type: 'text', text: reply.text }] };
          },
          abort() { aborted = true; },
        };
      },
    };
  },
});
const { default: handler } = await import('../netlify/functions/assistant.mjs');
const post = () => handler(new Request('https://example.test/api/assistant', {
  method: 'POST', body: JSON.stringify({ caseText: 'An adult needs support with family conflict.' }),
}));

test('streams long answers and continues every token-limited chunk until completion', async () => {
  const first = 'Detailed referral guidance. '.repeat(2000);
  replies = [{ text: first, stop: 'max_tokens' }, { text: 'More guidance.', stop: 'max_tokens' }, { text: 'Finished.', stop: 'end_turn' }];
  calls = [];
  assert.equal(await (await post()).text(), first + 'More guidance.Finished.');
  assert.equal(calls.length, 3);
  assert.equal(calls[1].messages[1].content[0].text, first);
  assert.equal(calls[2].messages[3].content[0].text, 'More guidance.');
  assert.match(calls[0].system[0].text, /no word-count limit/);
  for (const call of calls) assert.deepEqual(call.system, calls[0].system);
});

test('does not continue an answer that ends normally', async () => {
  replies = [{ text: 'Complete answer.', stop: 'end_turn' }];
  calls = [];
  assert.equal(await (await post()).text(), 'Complete answer.');
  assert.equal(calls.length, 1);
});

test('cancelling the response aborts generation', async () => {
  replies = [{ text: 'Partial answer.', stop: 'max_tokens' }];
  calls = [];
  aborted = false;
  const reader = (await post()).body!.getReader();
  await reader.read();
  await reader.cancel();
  assert.equal(aborted, true);
  assert.equal(calls.length, 1);
});


test('cached system prompt includes the current directory with FSC contacts and locations', async () => {
  replies = [{ text: 'Complete answer.', stop: 'end_turn' }];
  calls = [];
  await (await post()).text();
  const blocks = calls[0].system;
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'text');
  assert.deepEqual(blocks[0].cache_control, { type: 'ephemeral' });
  const system = blocks[0].text;
  for (const category of directory.categories) {
    assert.ok(system.includes(`${category.id}: ${category.label}`), `missing category ${category.id}`);
  }
  assert.ok(system.includes(`Directory last updated: ${directory.updated}\nDIRECTORY:`));
  const lines = system.split('\nDIRECTORY:\n')[1].split('\n');
  assert.equal(lines.length, directory.services.length);
  for (const service of directory.services) {
    const line = lines.find((line: string) => line.startsWith(`[${service.id}] `));
    assert.ok(line, `missing service ${service.id}`);
    for (const value of [service.name, service.org, service.desc, service.cats.join(', '),
      `phone: ${service.phone || 'n/a'}`, `website: ${service.web || 'n/a'}`]) {
      assert.ok(line.includes(value), `${service.id}: missing ${value}`);
    }
    if (service.h24) assert.ok(line.includes(' | 24h'));
    if (service.other) assert.ok(line.includes(` | contact: ${service.other}`));
    else assert.ok(!line.includes(' | contact:'));
    if (service.tags?.length) assert.ok(line.includes(` | tags: ${service.tags.join(', ')}`));
    else assert.ok(!line.includes(' | tags:'));
    if (service.address) assert.ok(line.includes(` | address: ${service.address}`));
    if (service.mapsUrl) assert.ok(line.includes(` | map: ${service.mapsUrl}`));
    for (const link of service.links || []) assert.ok(line.includes(` | ${link.label}: ${link.url}`));
  }
  const tamanJurong = lines.find((line: string) => line.startsWith('[fsc-fei-yue-sso-taman-jurong] '));
  assert.ok(tamanJurong.includes('contact: Email enquiry_FeiYueTJFST@fycs.org'));
  assert.ok(tamanJurong.includes('tags: FSC, Taman Jurong, Co-located with SSO'));
  assert.ok(system.includes("suggest the FSC(s) whose tags match that area first"));
  assert.ok(system.includes("SINDA FSC is only for Indian Singapore Citizens and PRs"));
  assert.ok(system.includes("Use only emails and numbers that appear in the directory, exactly as written."));
  assert.ok(system.includes("prefer that centre and say why."));
  assert.ok(system.includes('remote-only notices'));
  assert.ok(system.includes('not independent verification of every service'));
  const range = directory.services.filter((service: any) => service.org === 'RANGE Counselling Services');
  assert.equal(range.length, 4);
  for (const service of range) {
    const line = lines.find((line: string) => line.startsWith(`[${service.id}] `));
    assert.ok(line.includes('hello@rangecounsellingservices.com'));
    assert.ok(line.includes('Primz Bizhub, 21 Woodlands Close #02-24, Singapore 737854'));
    assert.ok(line.includes(service.other));
  }
});

test('accepts referral-letter requests with drafting instructions and factual safeguards', async () => {
  const caseText = 'Draft a referral letter from a case manager to a family service centre. Adult caregiver reports family conflict and needs support.';
  replies = [{ text: '## Draft referral letter\n\n[Date]\n\nDear [Receiving professional / service],', stop: 'end_turn' }];
  calls = [];
  const response = await handler(new Request('https://example.test/api/assistant', {
    method: 'POST', body: JSON.stringify({ caseText }),
  }));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Draft referral letter/);
  assert.equal(calls[0].messages[0].content, caseText);
  const system = calls[0].system[0].text;
  assert.match(system, /social workers, case managers, counsellors, psychologists and psychiatrists/);
  assert.match(system, /produce an editable draft rather than only a list of services/);
  assert.match(system, /Use only case facts the user supplies/);
  assert.match(system, /An unmentioned risk is unknown/);
  assert.match(system, /complete identifiers locally/);
  assert.match(system, /verify accuracy, consent, recipient requirements and urgency/);
  assert.doesNotMatch(system, /this tool only helps match cases to services/);
});
