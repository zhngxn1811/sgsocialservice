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

test('presents addresses as contact rows with safe map links and automatic Google Maps fallback', () => {
  const address = 'Blk 230 Ang Mo Kio Avenue 3, #01-1264, Singapore 560230';
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const linked = render({ address, mapsUrl });
  assert.ok(linked.includes(`<dt>Address</dt><dd><a href="${mapsUrl.replaceAll('&', '&amp;')}" target="_blank" rel="noopener">${address}</a></dd>`));
  assert.equal(render({ address }), linked);
  assert.ok(render({ other: `Address: ${address}` }).includes(`<dt>Address</dt><dd><a href="${mapsUrl.replaceAll('&', '&amp;')}" target="_blank" rel="noopener">${address}</a></dd>`));
  const unsafe = render({ address: '<unsafe>', mapsUrl: 'javascript:alert(1)' });
  assert.ok(unsafe.includes('<dt>Address</dt><dd>&lt;unsafe&gt;</dd>'));
  assert.ok(!unsafe.includes('href='));
});

test('includes all 24 supplied Social Service Offices with 22 map-linked addresses and two remote offices', () => {
  const { services, categories } = JSON.parse(readFileSync(new URL('../public/services.json', import.meta.url), 'utf8'));
  assert.equal(categories.find((c: any) => c.id === 'msf-sso')?.label, 'MSF Social Service Offices');
  const offices = services.filter((s: any) => s.id.startsWith('sso-'));
  assert.equal(offices.length, 24);
  assert.equal(new Set(offices.map((s: any) => s.id)).size, 24);
  assert.equal(offices.filter((s: any) => s.address).length, 22);
  for (const office of offices) {
    assert.ok(office.cats.includes('financial'));
    assert.ok(office.cats.includes('msf-sso'));
    if (office.address) {
      const url = new URL(office.mapsUrl);
      assert.equal(url.origin, 'https://www.google.com');
      assert.equal(url.searchParams.get('query'), office.address);
      assert.match(office.address, /Singapore \d{6}$/);
      assert.ok(card(office).includes('<dt>Address</dt><dd><a href="https://www.google.com/maps/'));
    } else {
      assert.ok(['sso-chua-chu-kang', 'sso-sembawang'].includes(office.id));
      assert.match(office.desc, /remotely with no walk-in services/);
      assert.ok(!office.mapsUrl);
      assert.ok(!card(office).includes('<dt>Address</dt>'));
    }
  }
});

test('includes the 55 revised FSC entries with the supplied contact fields', () => {
  const { services } = JSON.parse(readFileSync(new URL('../public/services.json', import.meta.url), 'utf8'));
  const centres = services.filter((s: any) => s.id.startsWith('fsc-'));
  assert.equal(centres.length, 55);
  assert.equal(new Set(centres.map((s: any) => s.id)).size, 55);
  assert.ok(!centres.some((s: any) => s.name === 'Fei Yue Family Service Centre (Bukit Panjang)'));
  assert.equal(services.filter((s: any) => s.id === 'fsc').length, 1);
  assert.ok(services.find((s: any) => s.id === 'fsc').cats.includes('msf-fsc'));
  for (const centre of centres) {
    assert.deepEqual(Object.keys(centre), ['id', 'name', 'org', 'cats', 'h24', 'desc', 'phone', 'other', 'web', 'tags', 'address', 'mapsUrl']);
    assert.equal(centre.h24, false);
    assert.match(centre.phone, /^(?:\d{4} \d{4}|1800 \d{3} \d{4})$/);
    assert.ok(centre.desc.length > 0);
    assert.ok(new URL(centre.web));
    assert.ok(centre.cats.includes('family'));
    assert.ok(centre.cats.includes('msf-fsc'));
    assert.ok(card(centre).includes('<dt>Website</dt>'));
    assert.match(centre.address, /Singapore \d{6}$/);
    const maps = new URL(centre.mapsUrl);
    assert.equal(maps.origin, 'https://www.google.com');
    assert.equal(maps.pathname, '/maps/search/');
    assert.equal(maps.searchParams.get('query'), centre.address);
    assert.ok(card(centre).includes(`<dt>Address</dt><dd><a href="${centre.mapsUrl.replaceAll('&', '&amp;')}" target="_blank" rel="noopener">${centre.address}</a></dd>`), centre.id);
    if (centre.other) assert.ok(card(centre).includes('href="mailto:'));
  }
});
