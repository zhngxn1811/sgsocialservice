import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from '../scripts/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://sgss.example';
const directory = JSON.parse(await readFile(path.join(ROOT, 'public/services.json'), 'utf8'));
const esc = (t: string) => t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

async function buildInto(root = ROOT) {
  const outDir = await mkdtemp(path.join(tmpdir(), 'sgss-build-'));
  const result = await build({ root, outDir, siteUrl: SITE, date: '2026-11-14' });
  return { outDir, result, read: (p: string) => readFile(path.join(outDir, p), 'utf8') };
}
const jsonLdBlocks = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));

test('home page has every listing in its HTML, before any JavaScript runs', async () => {
  const { read } = await buildInto();
  const home = await read('index.html');
  for (const s of directory.services) assert.ok(home.includes(`<h3>${esc(s.name)}</h3>`), `missing ${s.id}`);
  assert.equal(home.match(/<article class="card/g)!.length, directory.services.length);
  assert.ok(home.includes(`${directory.services.length} of ${directory.services.length} services`));
  assert.ok(!home.includes('<!-- build:'), 'a build marker was left unfilled');
  assert.ok(home.includes(`<link rel="canonical" href="${SITE}/">`));
  assert.ok(home.includes(`<meta property="og:image" content="${SITE}/og-image.png">`));
  assert.equal(jsonLdBlocks(home)[0]['@type'], 'WebSite');
});

test('each presenting issue gets its own page with only its listings', async () => {
  const { read, result } = await buildInto();
  const withListings = directory.categories.filter((c: any) => directory.services.some((s: any) => s.cats.includes(c.id)));
  assert.equal(result.pages.length, withListings.length);
  for (const page of result.pages) {
    const html = await read(`help/${page.slug}/index.html`);
    const expected = directory.services.filter((s: any) => s.cats.includes(page.id));
    assert.equal(html.match(/<article class="card/g)!.length, expected.length, page.slug);
    assert.ok(html.includes(`<link rel="canonical" href="${SITE}/help/${page.slug}/">`));
    assert.match(html, /<title>[^<]+ \| SG Social Services<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]{40,}">/);
    assert.equal(html.match(/<h1\b/g)!.length, 1, 'one h1 per page');
    const [graph] = jsonLdBlocks(html);
    assert.equal(graph['@graph'][1].mainEntity.numberOfItems, expected.length);
  }
});

test('crisis lines and footer appear on every issue page', async () => {
  const { read, result } = await buildInto();
  for (const page of result.pages) {
    const html = await read(`help/${page.slug}/index.html`);
    assert.ok(html.includes('SOS <span class="mono">1767</span>'), page.slug);
    assert.ok(html.includes('href="/privacy.html"'), page.slug);
  }
});

test('sitemap lists every page and robots.txt points to it', async () => {
  const { read, result } = await buildInto();
  const sitemap = await read('sitemap.xml');
  assert.ok(sitemap.includes(`<loc>${SITE}/</loc>`));
  for (const page of result.pages) assert.ok(sitemap.includes(`<loc>${SITE}/help/${page.slug}/</loc>`));
  const robots = await read('robots.txt');
  assert.ok(robots.includes('Disallow: /admin'));
  assert.ok(robots.includes(`Sitemap: ${SITE}/sitemap.xml`));
});

test('listing text cannot inject HTML or break out of structured data', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sgss-root-'));
  await cp(path.join(ROOT, 'public'), path.join(root, 'public'), { recursive: true });
  await cp(path.join(ROOT, 'content'), path.join(root, 'content'), { recursive: true });
  const evil = { ...directory, services: [{ id: 'x', name: '</script><script>alert(1)</script>', org: '<img src=x onerror=alert(1)>', cats: ['legal'], desc: '"><b>hi', tags: ['<i>'], web: 'https://example.org/?a=1&b="2"' }] };
  await writeFile(path.join(root, 'public/services.json'), JSON.stringify(evil));
  const { read } = await buildInto(root);
  for (const file of ['index.html', 'help/legal-help/index.html']) {
    const html = await read(file);
    assert.ok(!html.includes('<script>alert(1)'), file);
    assert.ok(!html.includes('<img src=x'), file);
    assert.ok(!html.includes('<b>hi'), file);
    jsonLdBlocks(html); // still valid JSON
  }
});

test('issues with no listings get no page', async () => {
  const { outDir } = await buildInto();
  assert.ok(!existsSync(path.join(outDir, 'help', 'undefined')));
  const root = await mkdtemp(path.join(tmpdir(), 'sgss-root-'));
  await cp(path.join(ROOT, 'public'), path.join(root, 'public'), { recursive: true });
  const data = { ...directory, categories: [...directory.categories, { id: 'empty', label: 'Nothing yet' }] };
  await writeFile(path.join(root, 'public/services.json'), JSON.stringify(data));
  const { result } = await buildInto(root);
  assert.ok(!result.pages.some((p: any) => p.id === 'empty'));
});
