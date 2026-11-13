import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const escapeSource = page.match(/^const esc=.*;$/m)![0];
const rendererSource = page.slice(page.indexOf('function md(t){'), page.indexOf('let abortCtl=null;'));
const md = runInNewContext(`${escapeSource}\n${rendererSource}\nmd`, { URL });

test('renders bold resource links within existing headings and bullets', () => {
  const html = md('## Resources\n- **[Support](https://example.org/help_(adults)?a=1&b=2)**: Why it fits.');
  assert.equal(html, '<h4>Resources</h4><ul><li><strong><a href="https://example.org/help_(adults)?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">Support</a></strong>: Why it fits.</li></ul>');
});

test('escapes generated HTML and attributes and rejects unsafe link protocols', () => {
  const html = md('[<img src=x onerror=alert(1)>](https://example.org/"x)\n[Unsafe](javascript:alert(1))\n[Data](data:text/html,payload)\n<script>alert(1)</script>');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('href="data:'));
  assert.ok(html.includes('href="https://example.org/&quot;x"'));
});

test('keeps incomplete streamed links as text until the destination arrives', () => {
  assert.equal(md('[Support](https://example.org'), '<p>[Support](https://example.org</p>');
  assert.match(md('[Support](https://example.org)'), /<a href="https:\/\/example.org"/);
});
