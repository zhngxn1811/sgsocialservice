import assert from 'node:assert/strict';
import { test } from 'node:test';
import { corsHeaders, withCors } from '../netlify/lib/cors.mjs';

const req = (origin?: string, method = 'POST') => new Request('https://example.test/api/x', {
  method, headers: origin ? { origin } : {},
});
const ok = withCors(async () => new Response('fine', { status: 200, headers: { 'Content-Type': 'text/plain' } }));

test('allows the iOS and Android apps', async () => {
  for (const origin of ['capacitor://localhost', 'https://localhost']) {
    const res = await ok(req(origin), undefined);
    assert.equal(res.headers.get('access-control-allow-origin'), origin);
    assert.equal(await res.text(), 'fine');
  }
});

test('does not open the API to other websites', async () => {
  const res = await ok(req('https://someone-else.example'), undefined);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.status, 200);
});

test('leaves same-origin requests from the website unchanged', async () => {
  const res = await ok(req(), undefined);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('content-type'), 'text/plain');
});

test('answers the pre-check without running the handler', async () => {
  let ran = false;
  const handler = withCors(async () => { ran = true; return new Response('x'); });
  const res = await handler(req('capacitor://localhost', 'OPTIONS'), undefined);
  assert.equal(res.status, 204);
  assert.equal(ran, false);
  assert.match(res.headers.get('access-control-allow-headers') || '', /x-admin-key/);
});

test('extra origins can be allowed with ALLOWED_ORIGINS', () => {
  process.env.ALLOWED_ORIGINS = 'https://staging.example, https://other.example';
  assert.equal(corsHeaders(req('https://other.example'))['Access-Control-Allow-Origin'], 'https://other.example');
  delete process.env.ALLOWED_ORIGINS;
  assert.deepEqual(corsHeaders(req('https://other.example')), {});
});
