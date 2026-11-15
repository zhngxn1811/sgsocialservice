import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const { card } = runInNewContext(`${readFileSync(new URL('../public/render.js', import.meta.url), 'utf8')}\nSGSSRender`, { URL });
const render = (fields: object) => card({ id: 'test', name: 'Support', org: 'Service', desc: '', cats: [], ...fields });

test('links separate emergency numbers and preserves phone formatting', () => {
  const html = render({ phone: '995 / 999; +65 6123 4567' });
  assert.match(html, /href="tel:995">995<\/a> \/ <a href="tel:999">999/);
  assert.match(html, /href="tel:\+6561234567">\+65 6123 4567/);
});

test('links WhatsApp and email without absorbing opening hours', () => {
  const html = render({ other: 'WhatsApp: 9151 1767 (24 hours); Email: pat@sos.org.sg' });
  assert.match(html, /href="https:\/\/wa.me\/6591511767"[^>]*>9151 1767<\/a> \(24 hours\)/);
  assert.match(html, /href="mailto:pat@sos.org.sg"/);
});

test('offers both SMS and WhatsApp for shared numbers and keeps SMS short codes local', () => {
  const html = render({ other: 'WhatsApp/SMS: 9769 4403; Police SMS: 70999; SCDF fire or medical emergency SMS: 70995' });
  for (const href of ['https://wa.me/6597694403', 'sms:97694403', 'sms:70999', 'sms:70995']) assert.ok(html.includes(`href="${href}"`));
});

test('normalizes websites and escapes contact text without linking unrelated numbers', () => {
  const html = render({ web: 'example.org/help', other: 'Office hours: 9-17; Skype: hotline_442; <script>alert(1)</script>; Website: example.org/help' });
  assert.match(html, /href="https:\/\/example.org\/help"/);
  assert.ok(!html.includes('href="tel:917"'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  const unsafe = render({ web: 'javascript:alert(1)', links: [{ url: 'data:text/html,hi', label: '<unsafe>' }] });
  assert.ok(!unsafe.includes('href='));
  assert.ok(unsafe.includes('&lt;unsafe&gt;'));
});

test('renders every current listing with actionable known contact values', () => {
  const { services } = JSON.parse(readFileSync(new URL('../public/services.json', import.meta.url), 'utf8'));
  for (const service of services) {
    const html = card(service);
    if (service.phone) assert.ok(html.includes('href="tel:'), service.id);
    if (/WhatsApp/i.test(service.other || '')) assert.ok(html.includes('href="https://wa.me/'), service.id);
    if (/SMS/i.test(service.other || '')) assert.ok(html.includes('href="sms:'), service.id);
    if (/Email/i.test(service.other || '')) assert.ok(html.includes('href="mailto:'), service.id);
  }
});


test('presents communication modes as labelled rows alongside Call and Website', () => {
  const html = render({ phone: '1234', web: 'https://example.org', other: 'Email: help@example.org; SMS/WhatsApp: 9769 4403; Skype: hotline_442; Police SMS: 70999' });
  for (const label of ['Call', 'Email', 'SMS/WhatsApp', 'Skype', 'SMS', 'Website']) {
    assert.ok(html.includes(`<dt>${label}</dt>`), label);
  }
  assert.ok(!html.includes('<dt>Also</dt>'));
  assert.match(html, /href="skype:hotline_442\?chat">hotline_442<\/a>/);
  assert.match(html, /<dt>SMS<\/dt><dd>Police: <a href="sms:70999"/);
  assert.ok(html.includes('href="sms:97694403"'));
  assert.ok(html.includes('href="https://wa.me/6597694403"'));
});
