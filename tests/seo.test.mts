import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from '../scripts/build.mjs';
import { RULES, checkSeo, fullTitle, resolveMeta, validateDirectory } from '../scripts/seo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = JSON.parse(await readFile(path.join(ROOT, 'public/services.json'), 'utf8'));
const page = (name: string, meta: object) => ({ name, path: `/${name}`, meta: resolveMeta(meta) });
const okDesc = 'A description that is comfortably long enough to pass the minimum length check easily.';

async function tempRoot(edit: (dir: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'sgss-seo-'));
  await cp(path.join(ROOT, 'public'), path.join(root, 'public'), { recursive: true });
  await cp(path.join(ROOT, 'content'), path.join(root, 'content'), { recursive: true });
  await edit(root);
  return root;
}
const buildAt = (root: string) => build({ root, outDir: path.join(root, 'dist'), siteUrl: 'https://sgss.example', date: '2026-11-15' });

test('site name is added to titles only when it fits', () => {
  assert.equal(fullTitle('Legal help'), 'Legal help | SG Social Services');
  const long = 'Free and low-cost legal help in Singapore today';
  assert.equal(fullTitle(long), long);
  assert.ok(fullTitle(long).length <= RULES.titleMax);
  assert.equal(fullTitle('SG Social Services: directory'), 'SG Social Services: directory');
});

test('social text falls back to the Google text when left empty', () => {
  const m = resolveMeta({ title: 'Legal help', description: okDesc, social_title: '  ', social_description: '' });
  assert.equal(m.socialTitle, 'Legal help');
  assert.equal(m.socialDescription, okDesc);
  assert.equal(resolveMeta({ title: 'A', description: okDesc, social_title: 'Warmer title' }).socialTitle, 'Warmer title');
});

test('checks flag long, short, missing and duplicate text', () => {
  const issues = checkSeo([
    page('long', { title: 'x'.repeat(70), description: okDesc }),
    page('short', { title: 'Short but fine title', description: 'Too short.' }),
    page('missing', { title: '', description: '' }),
    page('dupe-a', { title: 'Same title for both pages', description: okDesc + ' A' }),
    page('dupe-b', { title: 'Same title for both pages', description: okDesc + ' B' }),
    page('social', { title: 'Fine title for social test', description: okDesc + ' C', social_description: 'y'.repeat(250) }),
  ]);
  const has = (p: string, field: string, re: RegExp) => assert.ok(issues.some(i => i.page === p && i.field === field && re.test(i.message)), `${p} ${field}`);
  has('long', 'title', /70 characters/);
  has('short', 'description', /only 10 characters/);
  has('missing', 'title', /Missing/);
  has('missing', 'description', /Missing/);
  has('dupe-b', 'title', /Same title as "dupe-a"/);
  has('social', 'social_description', /250 characters/);
  assert.ok(!issues.some(i => i.page === 'dupe-a'), 'the first page with a title is not blamed');
});

test('/admin/seo shows the jobs board and checks its published metadata', async () => {
  const root = await tempRoot(async () => {});
  const result = await buildAt(root);
  assert.deepEqual(result.issues.map(({ path, field }) => [path, field]), [
    ['/jobs/', 'title'],
    ['/jobs/', 'description'],
  ]);
  const preview = await readFile(path.join(root, 'dist/admin/seo.html'), 'utf8');
  assert.ok(preview.includes('<meta name="robots" content="noindex,nofollow">'));
  assert.equal(preview.match(/<section class="page"/g)!.length, result.pages.length + 3);
  const jobs = preview.match(/<section class="page" id="p--jobs-">([\s\S]*?)<\/section>/)?.[1] ?? '';
  assert.ok(jobs.includes('<a class="mono" href="/jobs/">/jobs/</a>'));
  assert.ok(jobs.includes('Social and health services jobs in Singapore'));
  assert.ok(jobs.includes('Jobs in Singapore&#39;s social and health services'));
  assert.ok(jobs.includes('2 to fix'));
});

test('jobs board preview follows changes to its page metadata', async () => {
  const root = await tempRoot(async dir => {
    const file = path.join(dir, 'public/jobs/index.html');
    const jobs = await readFile(file, 'utf8');
    await writeFile(file, jobs.replace(/<title>[^<]*<\/title>/, '<title>Jobs in health &amp; social services</title>'));
  });
  await buildAt(root);
  const preview = await readFile(path.join(root, 'dist/admin/seo.html'), 'utf8');
  assert.ok(preview.includes('<div class="stitle">Jobs in health &amp; social services</div>'));
});

test('home and privacy text come from content/site.json', async () => {
  const root = await tempRoot(async dir => {
    const site = JSON.parse(await readFile(path.join(dir, 'content/site.json'), 'utf8'));
    site.home.title = 'Edited home title <b>';
    site.home.social_description = 'Edited social text for the home page';
    site.privacy.description = 'Edited privacy description that is long enough to be a sensible search snippet.';
    await writeFile(path.join(dir, 'content/site.json'), JSON.stringify(site));
  });
  await buildAt(root);
  const home = await readFile(path.join(root, 'dist/index.html'), 'utf8');
  assert.ok(home.includes('<title>Edited home title &lt;b&gt; | SG Social Services</title>'));
  assert.ok(home.includes('<meta property="og:description" content="Edited social text for the home page">'));
  assert.equal(home.match(/<title>/g)!.length, 1);
  const privacy = await readFile(path.join(root, 'dist/privacy.html'), 'utf8');
  assert.ok(privacy.includes('content="Edited privacy description that is long enough'));
  assert.ok(privacy.includes('<link rel="canonical" href="https://sgss.example/privacy.html">'));
});

test('the shipped directory is valid, and broken edits are caught', () => {
  assert.deepEqual(validateDirectory(directory), []);
  const broken = structuredClone(directory);
  broken.services[0].cats = ['not-a-category'];
  broken.services[1].name = '';
  broken.services[2].id = broken.services[3].id;
  broken.services[4].web = 'javascript:alert(1)';
  const problems = validateDirectory(broken).join('\n');
  assert.match(problems, /doesn't exist/);
  assert.match(problems, /missing name/);
  assert.match(problems, /used twice/);
  assert.match(problems, /isn't a web address/);
});

test('a broken services.json stops the build, so the live site stays up', async () => {
  const bad = await tempRoot(async dir => {
    const d = JSON.parse(await readFile(path.join(dir, 'public/services.json'), 'utf8'));
    d.services[0].cats = [];
    await writeFile(path.join(dir, 'public/services.json'), JSON.stringify(d));
  });
  await assert.rejects(buildAt(bad), /Build stopped: public\/services\.json has 1 problem.*needs at least one category/s);
  const invalid = await tempRoot(async dir => writeFile(path.join(dir, 'public/services.json'), '{ "services": [ '));
  await assert.rejects(buildAt(invalid), /isn't valid JSON/);
});

test('Pages CMS forms stay in step with the directory', async () => {
  const config = await readFile(path.join(ROOT, '.pages.yml'), 'utf8');
  const ids = directory.categories.map((c: any) => c.id);
  // every presenting issue has a search-text form
  for (const id of ids) assert.match(config, new RegExp(`name: ${id}\\b`), `.pages.yml has no form for "${id}"`);
  // the presenting-issue dropdown lists exactly the current categories
  const values = config.match(/values: \[([^\]]+)\]/)![1].split(',').map(s => s.trim());
  assert.deepEqual(values, ids);
  // every field used by a listing has a form field, so saving never drops data
  const keys = new Set(directory.services.flatMap((s: any) => Object.keys(s)));
  for (const k of keys) assert.match(config, new RegExp(`name: ${k}\\b`), `.pages.yml has no field for "${k}"`);
});
