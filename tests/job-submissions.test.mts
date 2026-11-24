import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { isLive, toPublic, type JobRecord } from '../netlify/lib/jobs.mts';

let saved: JobRecord | undefined;
let unavailable = false;
mock.module('../db/index.ts', { namedExports: { getDb: () => ({
  insert: () => ({ values: async (job: JobRecord) => {
    if (unavailable) throw new Error('Database unavailable');
    saved = job;
  } }),
}) } });

const { default: submitJob } = await import('../netlify/functions/job-submissions.mts');
const submit = (body: unknown) => submitJob(new Request('https://preview.example.test/api/job-submissions', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));
const listing = { title: ' Caseworker ', org: 'Community Services', apply_url: 'https://careers.example.test/jobs/caseworker' };

test('accepts a link-only job but never lets the submitter publish or add copied content', async () => {
  const response = await submit({ ...listing, status: 'open', description: 'Copied job description', source: 'manual' });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
  assert.ok(saved);
  assert.equal(saved.title, 'Caseworker');
  assert.equal(saved.apply_url, listing.apply_url);
  assert.equal(saved.source, 'submission');
  assert.equal(saved.status, 'pending');
  assert.equal(saved.description, '');
  assert.equal(isLive(saved, saved.posted_at!), false);
  assert.equal(isLive({ ...saved, status: 'open' }, saved.posted_at!), true);
  assert.equal(toPublic(saved).external_listing, true);
});

test('rejects invalid jobs, non-HTTPS links, and links back to the site', async () => {
  for (const body of [null, [], { ...listing, title: ' ' }, { ...listing, org: '' }, { ...listing, closes_at: '2000-01-01' },
    ...['http://example.test', 'https://', 'https://user@example.test', 'https://sgsocialservices.app/jobs/',
      'https://preview.example.test/jobs/'].map(apply_url => ({ ...listing, apply_url }))]) {
    saved = undefined;
    assert.equal((await submit(body)).status, 400);
    assert.equal(saved, undefined);
  }
});

test('ignores bot submissions and reports storage failures', async () => {
  saved = undefined;
  assert.equal((await submit({ ...listing, website: 'bot' })).status, 201);
  assert.equal(saved, undefined);
  unavailable = true;
  try { assert.equal((await submit(listing)).status, 500); } finally { unavailable = false; }
});
