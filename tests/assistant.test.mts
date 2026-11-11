import assert from 'node:assert/strict';
import { test, mock } from 'node:test';

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
  assert.match(calls[0].system, /no word-count limit/);
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
