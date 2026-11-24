import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkJobLink, isPublicAddress, linkCheckUpdate } from '../netlify/lib/job-link-check.mts';

test('outbound checks exclude private and special addresses', () => {
  for (const address of ['127.0.0.1', '169.254.169.254', '10.10.10.10', '100.64.1.1', '192.168.1.1', '224.0.0.1',
    '::1', '::ffff:127.0.0.1', 'fe80::1', 'fd00::1', '2001:db8::1', '2002:7f00:1::']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress('1.1.1.1'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('redirects are checked again before a request is sent', async () => {
  const calls: string[] = [];
  assert.equal(await checkJobLink('https://jobs.example.test/start', async url => {
    calls.push(url.href);
    if (calls.length === 1) return { status: 301, location: '/closed' };
    return { status: 410 };
  }), 410);
  assert.deepEqual(calls, ['https://jobs.example.test/start', 'https://jobs.example.test/closed']);
  for (const location of ['https://127.0.0.1/', 'https://[::1]/', 'http://jobs.example.test/', 'https://jobs.example.test:8080/']) {
    let attempts = 0;
    assert.equal(await checkJobLink('https://jobs.example.test/start', async () => {
      attempts++;
      return { status: 302, location };
    }), null);
    assert.equal(attempts, 1);
  }
  assert.equal(await checkJobLink('mailto:careers@example.test', async () => assert.fail('Email links must not be fetched')), null);
});

test('flags repeated 404s or 410s, ignores inconclusive results, and clears on recovery', () => {
  assert.deepEqual(linkCheckUpdate(404, 0), { link_missing_count: 1, link_missing_code: 404 });
  assert.deepEqual(linkCheckUpdate(410, 1), { link_missing_count: 2, link_missing_code: 410 });
  assert.deepEqual(linkCheckUpdate(410, 2), { link_missing_count: 2, link_missing_code: 410 });
  for (const status of [null, 301, 403, 429, 500]) assert.deepEqual(linkCheckUpdate(status, 2), {});
  assert.deepEqual(linkCheckUpdate(200, 2), { link_missing_count: 0, link_missing_code: null });
});
