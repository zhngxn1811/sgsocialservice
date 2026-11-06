import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import type { Context } from '@netlify/functions';

let saved: Record<string, unknown> | undefined;
let fail = false;
const db = {
  update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ id: 'existing' }] }) }) }),
  insert: () => ({ values: async (record: Record<string, unknown>) => {
    if (fail) throw new Error('Unavailable');
    saved = record;
  } }),
};
mock.module('../db/index.ts', { namedExports: { getDb: () => db } });
const { default: handler } = await import('../netlify/functions/submissions.mts');
const context = { params: {} } as Context;
const post = (body: unknown) => handler(new Request('https://example.test/api/submissions', {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
}), context);

test('saves every recommendation field with review metadata', async () => {
  const response = await post({ kind: 'recommend', name: ' Programme ', org: 'Agency', category: 'family', phone: '123', web: 'https://example.test', details: 'Support for families', role: 'Caseworker' });
  assert.equal(response.status, 201);
  assert.equal(saved?.name, 'Programme');
  for (const field of ['org', 'category', 'phone', 'web', 'details', 'role']) assert.ok(saved?.[field]);
  assert.equal(saved?.status, 'new');
  assert.ok(saved?.id);
  assert.ok(saved?.created_at);
});

test('saves selected listing for an update', async () => {
  assert.equal((await post({ kind: 'update', serviceId: 'listing-1', name: 'Listing', details: 'New hours' })).status, 201);
  assert.equal(saved?.service_id, 'listing-1');
});

test('rejects missing required fields and malformed payloads', async () => {
  for (const body of [null, [], {kind: 'other'}, {kind: 'recommend', details: 'Details'}, {kind: 'recommend', name: 'Name', details: ' '}, {kind: 'update', details: 'Details'}]) {
    saved = undefined;
    assert.equal((await post(body)).status, 400);
    assert.equal(saved, undefined);
  }
});

test('does not save honeypot submissions', async () => {
  saved = undefined;
  assert.equal((await post({ website: 'spam' })).status, 201);
  assert.equal(saved, undefined);
});

test('returns an error if persistence fails', async () => {
  fail = true;
  assert.equal((await post({ kind: 'recommend', name: 'Name', details: 'Details' })).status, 500);
  fail = false;
});

test('protects the inbox and review actions with the admin key', async () => {
  Object.assign(globalThis, { Netlify: { env: { get: () => 'test-only-key' } } });
  for (const method of ['GET', 'PATCH']) {
    const response = await handler(new Request('https://example.test/api/submissions', { method }), context);
    assert.equal(response.status, 401);
  }
});

test('validates and saves admin review status', async () => {
  const patch = (status: string) => handler(new Request('https://example.test/api/submissions/existing', {
    method: 'PATCH', headers: { 'x-admin-key': 'test-only-key', 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }), { params: { id: 'existing' } } as Context);
  assert.equal((await patch('invalid')).status, 400);
  assert.equal((await patch('done')).status, 200);
});
