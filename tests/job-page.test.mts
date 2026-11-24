import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { employmentTypes, renderJobPage, renderNotFound, textToHtml } from '../netlify/lib/job-page.mts';
import { mapMcfJob, type JobRecord } from '../netlify/lib/jobs.mts';
import { mcf } from './fixtures/mcf.mts';

const job = (o: Partial<JobRecord> = {}): JobRecord => ({ ...mapMcfJob(mcf())!, ...o });
const BASE = 'https://sgsocialservices.example';

test('job page shows the description, requirements, facts and an apply button to the portal', () => {
  const { status, html } = renderJobPage(job(), BASE, '2026-11-24');
  assert.equal(status, 200);
  assert.match(html, /<h1>Social Worker - Social Housing \(Rental Housing Projects\)<\/h1>/);
  assert.match(html, /<h2>About the role<\/h2>/);
  assert.match(html, /<h2>Requirements<\/h2>.*Degree in Social Work/s);
  assert.equal((html.match(/class="btn primary[^"]*" href="https:\/\/www\.mycareersfuture\.gov\.sg\/job\/social-services\/social-worker-social-housing-new-hope-232da04726ad9548e5bef220dd8ff19e" target="_blank" rel="noopener noreferrer">Apply on MyCareersFuture</g) || []).length, 2);
  assert.match(html, /<dt>Qualification<\/dt><dd>Bachelor&#39;s degree<\/dd>/);
  assert.match(html, /<dt>Experience<\/dt><dd>At least 2 years<\/dd>/);
  assert.match(html, /<dt>Salary<\/dt><dd>\$4,000 to \$5,000 monthly<\/dd>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/sgsocialservices\.example\/jobs\/social-worker/);
  assert.ok(!html.includes('<script>alert'));
});

test('structured data lets search engines show the job until it closes', () => {
  const { html } = renderJobPage(job(), BASE, '2026-11-24');
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]);
  assert.equal(ld['@type'], 'JobPosting');
  assert.equal(ld.validThrough, '2026-12-19T23:59:59+08:00');
  assert.deepEqual(ld.employmentType, ['FULL_TIME']);
  assert.equal(ld.jobLocation.address.addressCountry, 'SG');
  assert.equal(ld.baseSalary.value.unitText, 'MONTH');
  assert.equal(ld.hiringOrganization.name, 'New Hope Community Services Limited');
});

test('estimated board expiry does not claim an employer set a deadline or closed applications', () => {
  const estimated = job({ closing_date_estimated: true });
  const live = renderJobPage(estimated, BASE, '2026-12-19');
  assert.equal(live.status, 200);
  assert.match(live.html, /Listed until.*employer deadline not stated/);
  assert.doesNotMatch(live.html, /Applications close|validThrough/);
  const expired = renderJobPage(estimated, BASE, '2026-12-20');
  assert.equal(expired.status, 410);
  assert.match(expired.html, /no longer listed on the board/);
  assert.doesNotMatch(expired.html, /no longer taking applications/);
});

test('everything from the listing is escaped', () => {
  const { html } = renderJobPage(job({ title: '<img src=x onerror=alert(1)>', org: '"><script>x</script>', description: '## <b>Hi</b>\n- <i>item</i>', apply_url: 'https://e.org/a"onmouseover="x' }), BASE, '2026-11-24');
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script>x'));
  assert.ok(!html.includes('<b>Hi</b>'));
  assert.ok(html.includes('href="https://e.org/a&quot;onmouseover=&quot;x"'));
  const ld = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1];
  assert.ok(!ld.includes('</script'));
});

test('closed and expired jobs say so, answer 410, and are kept out of search', () => {
  for (const j of [job({ status: 'closed' }), job({ closes_at: '2026-11-20' })]) {
    const { status, html } = renderJobPage(j, BASE, '2026-11-24');
    assert.equal(status, 410);
    assert.match(html, /no longer taking applications/);
    assert.match(html, /noindex/);
    assert.ok(!html.includes('Apply on MyCareersFuture'));
  }
  assert.equal(renderJobPage(job({ closes_at: '2026-11-24' }), BASE, '2026-11-24').status, 200); // open on its closing day
  assert.match(renderNotFound(BASE), /couldn&#39;t find that job/);
});

test('text layout and employment types', () => {
  assert.equal(textToHtml('## Duties\n- One\n- Two\nThanks'), '<h3>Duties</h3><ul><li>One</li><li>Two</li></ul><p>Thanks</p>');
  assert.deepEqual(employmentTypes('Full Time, Contract, Internship/Attachment'), ['FULL_TIME', 'CONTRACTOR', 'INTERN']);
});

test('the shared markdown renderer escapes, keeps only web links and handles numbered lists', () => {
  const ctx: { SGSSMarkdown?: { md: (t: string) => string } } = {};
  runInNewContext(readFileSync(new URL('../public/md.js', import.meta.url), 'utf8'), { globalThis: ctx, window: undefined, URL });
  const md = ctx.SGSSMarkdown!.md;
  assert.equal(md('## Matches\n- **[Social Worker, Care Corner](https://x.sg/jobs/a)**: fits.\n1. Second'), '<h4>Matches</h4><ul><li><strong><a href="https://x.sg/jobs/a" target="_blank" rel="noopener noreferrer">Social Worker, Care Corner</a></strong>: fits.</li><li>Second</li></ul>');
  const bad = md('[x](javascript:alert(1)) <script>alert(1)</script> [<img src=x>](https://e.org/"y)');
  assert.ok(!bad.includes('href="javascript'));
  assert.ok(!bad.includes('<script'));
  assert.ok(!bad.includes('<img'));
  assert.equal(md('[Apply](https://e.org'), '<p>[Apply](https://e.org</p>');
});
