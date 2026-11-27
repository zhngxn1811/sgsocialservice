import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const data = JSON.parse(readFileSync(new URL('../public/training/courses.json', import.meta.url), 'utf8'));
const ctx: any = {};
runInNewContext(readFileSync(new URL('../public/training/training.js', import.meta.url), 'utf8'), { globalThis: ctx, window: undefined });
const T = ctx.SGSSTraining;
const TODAY = '2026-11-28';

test('every course is complete and uses the agreed labels', () => {
  const tax = data.taxonomy;
  const ids = (k: string) => new Set(tax[k].map((o: any) => o.id));
  const seen = new Set<string>();
  assert.ok(data.courses.length >= 40);
  for (const c of data.courses) {
    const where = `course ${c.id}`;
    assert.match(c.id, /^[a-z0-9-]+$/, where);
    assert.ok(!seen.has(c.id), `${where} appears twice`); seen.add(c.id);
    for (const k of ['title', 'provider', 'summary', 'next_run']) assert.ok(c[k]?.trim(), `${where} needs ${k}`);
    assert.match(c.url, /^https:\/\//, `${where} needs an https link`);
    assert.ok(c.approaches.length && c.approaches.every((a: string) => ids('approaches').has(a)), `${where} approaches`);
    assert.ok(c.professions.length && c.professions.every((a: string) => ids('professions').has(a)), `${where} professions`);
    assert.ok(c.funding.every((a: string) => ids('funding').has(a)), `${where} funding`);
    assert.ok(ids('levels').has(c.level) && ids('formats').has(c.format) && ids('providers').has(c.provider_type), `${where} level/format/provider`);
    assert.ok(c.next_date === null || /^\d{4}-\d{2}-\d{2}$/.test(c.next_date), `${where} next_date`);
    assert.match(c.checked, /^\d{4}-\d{2}-\d{2}$/, `${where} checked`);
    assert.ok(Array.isArray(c.fees) && c.fees.every((f: any) => f.label?.trim() && f.amount?.trim()), `${where} fees need a label and amount`);
    assert.ok(c.fees.length || c.fees_note.trim(), `${where} needs fees, or a note saying where to find them`);
    assert.ok(!/\$\s?\d/.test(`${c.summary} ${c.next_run} ${c.duration}`), `${where} keeps fees in the fees list, not the text`);
    assert.ok(c.accreditation.every((a: string) => typeof a === 'string' && a.trim()), `${where} accreditation`);
    assert.ok(c.grants.every((g: any) => g.name?.trim() && g.detail?.trim()), `${where} grants need a name and who qualifies`);
    if (c.grants.length) assert.ok(c.funding.length, `${where} has grants but no funding filter tags`);
    assert.ok(c.course_code === '' || /^TGS-\d{10}$/.test(c.course_code), `${where} course code`);
  }
  for (const cal of data.calendars) assert.match(cal.url, /^https:\/\//);
});

test('filters combine the way people expect', () => {
  const all = data.courses;
  const ids = (f: object) => Array.from(T.filterCourses(all, f, TODAY), (c: any) => c.id);
  assert.ok(ids({ approach: ['supervision'] }).includes('sasw-supervision-basic'));
  assert.ok(ids({ approach: ['play-therapy'], profession: ['psychologists'] }).every((id: string) => /play|gestalt/.test(id)));
  assert.deepEqual(ids({ provider: ['healthcare'] }), ['sgh-essential-counselling']);
  assert.ok(ids({ upcoming: true }).every((id: string) => all.find((c: any) => c.id === id).next_date >= TODAY));
  assert.ok(ids({ q: 'TGS-2020500646' }).includes('ssi-mi-intro'));
  assert.ok(ids({ q: 'motivational' }).includes('ssi-mi-intro'), 'searches the summary and title');
  assert.equal(ids({ approach: ['cbt'], level: ['qualification'], funding: ['pcg'] }).length, 0);
});

test('next run first puts confirmed dates at the top, soonest first', () => {
  const sorted = Array.from(T.sortCourses(data.courses, 'upcoming', TODAY), (c: any) => c.next_date);
  const dated = sorted.filter(Boolean) as string[];
  assert.deepEqual(sorted.slice(0, dated.length), [...dated].sort());
  assert.ok(sorted.slice(dated.length).every((d: any) => d === null));
  const past = { ...data.courses[0], next_date: '2026-01-01' };
  assert.equal(T.isUpcoming(past, TODAY), false, 'a past date is not upcoming');
});

test('fees, accreditation and grants show on the card, with a fee sort and accreditation filter', () => {
  const asist = data.courses.find((x: any) => x.id === 'sasw-asist');
  const html = T.card(asist, data.taxonomy, TODAY);
  assert.match(html, /<dt>After approved PCG claim<\/dt><dd>\$357\.50<\/dd>/);
  assert.match(html, /Funding and grants \(2\)/);
  assert.match(html, /<li>ASIST by LivingWorks/);
  assert.equal(T.lowestFee(asist), 357.5);
  assert.equal(T.lowestFee({ fees: [{ label: 'Fee', amount: 'Free' }] }), 0);
  assert.equal(T.lowestFee({ fees: [] }), Infinity);
  assert.equal(T.lowestFee({ fees: [{ label: 'x', amount: '$1,035.50 to $2,071' }] }), 1035.5);
  const byFee = Array.from(T.sortCourses(data.courses, 'fee', TODAY), (c: any) => T.lowestFee(c));
  assert.deepEqual(byFee, [...byFee].sort((a, b) => a - b));
  assert.equal(byFee[0], 0, 'free courses come first');
  const acc = Array.from(T.filterCourses(data.courses, { accredited: true }, TODAY), (c: any) => c.id);
  assert.ok(acc.includes('ccc-gdip-counselling') && acc.includes('nie-group-supervision-cp') && !acc.includes('sasw-ethics'));
  assert.ok(Array.from(T.filterCourses(data.courses, { funding: ['mces'] }, TODAY), (c: any) => c.provider).every((p: string) => /SUSS/.test(p)));
});

test('cards escape text and only link to https pages', () => {
  const c = { ...data.courses[0], title: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)', summary: 'a "quote"' };
  const html = T.card(c, data.taxonomy, TODAY);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('javascript:'));
  assert.match(html, /a &quot;quote&quot;/);
  const ok = T.card(data.courses.find((x: any) => x.id === 'sasw-asist'), data.taxonomy, TODAY);
  assert.match(ok, /href="https:\/\/sasw\.org\.sg\/programme\/asist-suicide-first-aid" target="_blank" rel="noopener noreferrer">View course/);
  assert.match(ok, /class="next soon"/, 'a run within 45 days is highlighted');
});

test('postgraduate pathways distinguish programme recognition from registration criteria', () => {
  const programmes = T.filterCourses(data.courses, { level: ['postgraduate'] }, TODAY);
  const recognised = T.filterCourses(programmes, { accredited: true }, TODAY);
  const psychology = T.filterCourses(programmes, { profession: ['psychologists'] }, TODAY);
  assert.ok(recognised.some((course: any) => course.recognition_url.includes('sacsingapore.org')));
  assert.ok(recognised.some((course: any) => course.recognition_url.includes('sasw.org.sg')));
  assert.ok(psychology.length > 0);
  for (const course of psychology) {
    assert.ok(!recognised.includes(course));
    assert.match(T.card(course, data.taxonomy, TODAY), /Check registration criteria/);
  }
  for (const course of programmes) assert.match(course.recognition_url, /^https:\/\//);
  assert.match(T.card(recognised[0], data.taxonomy, TODAY), /Check programme recognition/);
  assert.doesNotMatch(T.card({ ...recognised[0], recognition_url: 'javascript:alert(1)' }, data.taxonomy, TODAY), /javascript:/);
});
