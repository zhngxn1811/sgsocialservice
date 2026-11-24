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
  select: () => ({ from: () => ({ where: () => ({ limit: async () => saved ? [saved] : [] }) }) }),
}) } });

const { default: submitJob } = await import('../netlify/functions/job-submissions.mts');
const { default: jobPage } = await import('../netlify/functions/job-page.mts');
const submit = (body: unknown) => submitJob(new Request('https://preview.example.test/api/job-submissions', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));
const listing = {
  title: ' Caseworker ', org: 'Community Services', apply_url: 'https://careers.example.test/jobs/caseworker',
  description: 'Support families <b>in the community</b>.', requirements: 'Bachelor’s degree in Social Work.',
};

test('stores full job details but never lets the submitter publish', async () => {
  const response = await submit({ ...listing, status: 'open', source: 'manual' });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
  assert.ok(saved);
  assert.equal(saved.title, 'Caseworker');
  assert.equal(saved.apply_url, listing.apply_url);
  assert.equal(saved.source, 'submission');
  assert.equal(saved.status, 'pending');
  assert.equal(saved.description, listing.description);
  assert.equal(saved.requirements, listing.requirements);
  assert.equal(isLive(saved, saved.posted_at!), false);
  assert.equal(isLive({ ...saved, status: 'open' }, saved.posted_at!), true);
  assert.equal(toPublic(saved).external_listing, undefined);
  assert.equal(toPublic({ ...saved, description: '', requirements: '' }).external_listing, true);
});

test('publishes a full detail page only after approval, with an email application link', async () => {
  const apply_url = 'mailto:careers@example.test';
  assert.equal((await submit({ ...listing, apply_url })).status, 201);
  assert.ok(saved);
  assert.equal(saved.apply_url, apply_url);
  assert.equal(saved.source_url, '');
  const previousNetlify = globalThis.Netlify;
  globalThis.Netlify = { env: { get: () => undefined } } as typeof Netlify;
  try {
    const context = { params: { id: saved.id } } as Parameters<typeof jobPage>[1];
    const getPage = () => jobPage(new Request(`https://preview.example.test/jobs/${saved!.id}`), context);
    const pendingPage = await getPage();
    assert.equal(pendingPage.status, 404);
    assert.doesNotMatch(await pendingPage.text(), /Support families|Caseworker/);
    saved.status = 'open';
    const published = await getPage();
    assert.equal(published.status, 200);
    const html = await published.text();
    assert.match(html, /Support families &lt;b&gt;in the community&lt;\/b&gt;/);
    assert.match(html, /Bachelor’s degree in Social Work/);
    assert.match(html, /href="mailto:careers@example.test">Apply by email/);
    saved.status = 'closed';
    assert.equal((await getPage()).status, 404);
  } finally {
    globalThis.Netlify = previousNetlify;
  }
});

test('rejects missing or excessive details, unsafe links, and links back to the site', async () => {
  for (const body of [null, [], { ...listing, title: ' ' }, { ...listing, org: '' }, { ...listing, closes_at: '2000-01-01' },
    { ...listing, description: '' }, { ...listing, requirements: ' ' }, { ...listing, description: 'a'.repeat(20_001) },
    ...['http://example.test', 'https://', 'https://user@example.test', 'https://sgsocialservices.app/jobs/',
      'mailto:not-an-address', 'mailto:a@example.test,b@example.test', 'mailto:a@example.test?bcc=b@example.test', 'javascript:alert(1)',
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
