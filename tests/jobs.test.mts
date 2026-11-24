import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  filterJobs, freshGradOf, htmlToText, isLive, isOpenMcf, isRelevantMcf, jobId, manualJob, mapMcfJob, minYearsOf,
  natureOf, orgTypeOf, qualificationOf, sortJobs, splitRequirements, titleCase, toPublic, type McfJob, type PublicJob,
} from '../netlify/lib/jobs.mts';
import { collectMcfJobs } from '../netlify/lib/jobs-sync.mts';
import { mcf } from './fixtures/mcf.mts';


test('minimum qualification: required beats preferred, lowest required wins', () => {
  assert.equal(qualificationOf('Degree in Social Work required. Master\'s preferred.'), 'bachelors');
  assert.equal(qualificationOf('Master\'s degree in Clinical Psychology from a recognised university.'), 'masters');
  assert.equal(qualificationOf('Diploma or Degree in Psychology, Social Work or related field.'), 'diploma');
  assert.equal(qualificationOf('Graduate Diploma in Counselling required.'), 'graduate-diploma');
  assert.equal(qualificationOf('Degree or Graduate Diploma in Counselling.'), 'bachelors');
  assert.equal(qualificationOf('Diploma or Graduate Diploma in Counselling.'), 'diploma');
  assert.equal(qualificationOf('Honours degree in Psychology (or equivalent).'), 'honours');
  assert.equal(qualificationOf('PhD or DClinPsy in Clinical Psychology.'), 'doctorate');
  assert.equal(qualificationOf('Postgraduate diploma in counselling.'), 'masters');
  assert.equal(qualificationOf('A master\'s degree would be an advantage.'), 'masters'); // only preferred, so that's what we have
  assert.equal(qualificationOf('Friendly and caring.', '70'), 'bachelors');
  assert.equal(qualificationOf('Friendly and caring.', '52'), 'diploma');
  assert.equal(qualificationOf('Friendly and caring.', '92'), 'doctorate');
  assert.equal(qualificationOf('Friendly and caring.'), 'unspecified');
});

test('experience and fresh graduates', () => {
  assert.equal(minYearsOf('anything', 2), 2);
  assert.equal(minYearsOf('At least 3 years of relevant experience.'), 3);
  assert.equal(minYearsOf('5 years of experience in a hospital is an advantage.'), null);
  assert.equal(minYearsOf('Minimum 1-2 years experience in social services.'), 1);
  assert.equal(freshGradOf('Fresh graduates are welcome to apply.', 1), true);
  assert.equal(freshGradOf('Senior role.', 0), true);
  assert.equal(freshGradOf('Senior role.', 3), false);
  assert.equal(freshGradOf('This role is not suitable for fresh graduates.', 0), false);
});

test('nature of work comes mostly from the title', () => {
  assert.deepEqual(natureOf('Senior Social Worker', 'Provide counselling to families.'), ['social-work']);
  assert.ok(natureOf('Clinical Psychologist', 'Psychological assessment.').includes('clinical-psychology'));
  assert.ok(!natureOf('Clinical Psychologist', 'Psychological assessment.').includes('psychology'));
  assert.deepEqual(natureOf('Youth Worker', ''), ['youth-work']);
  assert.ok(natureOf('Executive', 'Case management for clients. Case management reviews.').includes('case-management'));
});

test('type of organisation', () => {
  assert.equal(orgTypeOf('SINGAPORE GENERAL HOSPITAL PTE LTD'), 'healthcare');
  assert.equal(orgTypeOf('MINISTRY OF SOCIAL AND FAMILY DEVELOPMENT'), 'government');
  assert.equal(orgTypeOf('NATIONAL UNIVERSITY OF SINGAPORE'), 'education');
  assert.equal(orgTypeOf('THE SALVATION ARMY'), 'charity');
  assert.equal(orgTypeOf('NEW HOPE COMMUNITY SERVICES LIMITED'), 'social-community');
  assert.equal(orgTypeOf('Some Clinic', '', { 'SOME CLINIC': 'charity' }), 'charity');
  assert.equal(orgTypeOf('Whatever Ltd', 'HOSPITALS'), 'healthcare');
});

test('portal HTML becomes safe plain text with headings and bullets', () => {
  const t = htmlToText('<h3>About</h3><p>Help &amp; care</p><ul><li>One</li><li>Two</li></ul><script>alert(1)</script><p>&lt;img src=x onerror=alert(1)&gt;</p>');
  assert.equal(t, '## About\n\nHelp & care\n\n- One\n- Two');
  assert.ok(!/[<>]/.test(htmlToText('<b>x</b>&lt;script&gt;y&lt;/script&gt;')));
});

test('requirements are split from the description', () => {
  const { description, requirements } = splitRequirements(htmlToText(mcf().description!));
  assert.match(description, /^## Job Summary/);
  assert.match(requirements, /Degree in Social Work/);
  assert.ok(!/Requirements/.test(description));
});

test('maps a MyCareersFuture listing', () => {
  const j = mapMcfJob(mcf())!;
  assert.equal(j.title, 'Social Worker - Social Housing (Rental Housing Projects)');
  assert.equal(j.org, 'New Hope Community Services Limited');
  assert.equal(j.org_type, 'social-community');
  assert.equal(j.qualification, 'bachelors');
  assert.equal(j.min_years, 2);
  assert.equal(j.fresh_grad, false);
  assert.ok(j.nature.includes('social-work'));
  assert.ok(j.skills.includes('Case management') && j.skills.includes('Communication'));
  assert.equal(j.apply_url, mcf().metadata!.jobDetailsUrl);
  assert.equal(j.closes_at, '2026-12-19');
  assert.equal(j.posted_at, '2026-11-19');
  assert.equal(j.salary_min, 4000);
  assert.equal(j.location, 'Singapore');
  assert.match(j.id, /^social-worker-social-housing-rental-housing-projects-new-hope-community-services-232da047$/);
  assert.ok(!/alert/.test(j.description + j.requirements));
  assert.equal(mapMcfJob(mcf({ metadata: { ...mcf().metadata, isHideSalary: true } }))!.salary_min, null);
  assert.equal(mapMcfJob(mcf({ uuid: '' })), null);
});

test('only open Singapore roles in the sector', () => {
  assert.equal(isRelevantMcf(mcf()), true);
  assert.equal(isRelevantMcf(mcf({ categories: [{ category: 'Engineering' }], title: 'Software Engineer' })), false);
  assert.equal(isRelevantMcf(mcf({ categories: [{ category: 'Healthcare / Pharmaceutical' }], title: 'Senior Medical Social Worker' })), true);
  assert.equal(isRelevantMcf(mcf({ address: { isOverseas: true, overseasCountry: 'Malaysia' } })), false);
  assert.equal(isOpenMcf(mcf(), '2026-11-24'), true);
  assert.equal(isOpenMcf(mcf(), '2026-12-20'), false);
  assert.equal(isOpenMcf(mcf({ status: { jobStatus: 'Closed' } }), '2026-11-24'), false);
});

test('jobs added by hand must be current, Singapore-based and have an https application link', () => {
  const ok = { title: 'Counsellor', org: 'Some Charity Association', apply_url: 'https://example.org/apply', closes_at: '2026-12-31', description: 'Fresh graduates welcome.', requirements: 'Degree in Psychology.' };
  const made = manualJob(ok, '2026-11-24');
  assert.ok('job' in made);
  if ('job' in made) {
    assert.equal(made.job.qualification, 'bachelors');
    assert.equal(made.job.fresh_grad, true);
    assert.equal(made.job.org_type, 'charity');
    assert.deepEqual(made.job.nature, ['counselling']);
    assert.equal(made.job.source, 'manual');
  }
  assert.match((manualJob({ ...ok, apply_url: 'http://x.org' }, '2026-11-24') as { error: string }).error, /https/);
  assert.match((manualJob({ ...ok, closes_at: '2026-11-01' }, '2026-11-24') as { error: string }).error, /passed/);
  assert.match((manualJob({ ...ok, location: 'Kuala Lumpur' }, '2026-11-24') as { error: string }).error, /Singapore/);
  assert.match((manualJob({ ...ok, apply_url: 'javascript:alert(1)' }, '2026-11-24') as { error: string }).error, /https/);
});

test('manual jobs default to 30 calendar days but preserve an explicit closing date', () => {
  const input = { title: 'Counsellor', org: 'Some Charity', apply_url: 'https://example.org/apply', posted_at: '2026-11-20' };
  const estimated = manualJob(input, '2026-11-24');
  assert.ok('job' in estimated);
  assert.equal(estimated.job.closes_at, '2026-12-20');
  assert.equal(toPublic(estimated.job).closing_date_estimated, true);
  assert.equal(isLive(estimated.job, '2026-12-20'), true);
  assert.equal(isLive(estimated.job, '2026-12-21'), false);

  const explicit = manualJob({ ...input, closes_at: '2026-11-30' }, '2026-11-24');
  assert.ok('job' in explicit);
  assert.equal(explicit.job.closes_at, '2026-11-30');
  assert.equal(explicit.job.closing_date_estimated, false);

  const noDates = manualJob({ ...input, posted_at: '' }, '2026-12-20');
  assert.ok('job' in noDates);
  assert.equal(noDates.job.posted_at, '2026-12-20');
  assert.equal(noDates.job.closes_at, '2027-01-19');

  assert.match((manualJob({ ...input, posted_at: '2026-09-21' }, '2026-11-24') as { error: string }).error, /passed/);
  assert.match((manualJob({ ...input, posted_at: '2026-11-31' }, '2026-11-24') as { error: string }).error, /valid posting date/);
  assert.match((manualJob({ ...input, closes_at: '2026-12-32' }, '2026-11-24') as { error: string }).error, /valid closing date/);
});

test('portal jobs without a deadline expire after 30 days when a posting date is known', () => {
  const raw = mcf({ metadata: { originalPostingDate: '2026-10-31T08:00:00+08:00' } });
  assert.equal(mapMcfJob(raw)?.closes_at, '2026-11-30');
  assert.equal(mapMcfJob(raw)?.closing_date_estimated, true);
  assert.equal(isOpenMcf(raw, '2026-11-30'), true);
  assert.equal(isOpenMcf(raw, '2026-12-01'), false);
  assert.equal(mapMcfJob(mcf())?.closing_date_estimated, false);
  assert.equal(mapMcfJob(mcf({ metadata: {} }))?.closes_at, null);
});

const pub = (o: Partial<PublicJob>): PublicJob => ({ ...toPublic(mapMcfJob(mcf())!), ...o });
const sample = [
  pub({ id: 'a', title: 'Social Worker', qualification: 'bachelors', min_years: 2, fresh_grad: false, nature: ['social-work'], org_type: 'social-community', posted_at: '2026-11-10', closes_at: '2026-12-01' }),
  pub({ id: 'b', title: 'Clinical Psychologist', qualification: 'masters', min_years: 0, fresh_grad: true, nature: ['clinical-psychology'], org_type: 'healthcare', posted_at: '2026-11-20', closes_at: '2026-11-28', skills: ['CBT'] }),
  pub({ id: 'c', title: 'Programme Executive', qualification: 'diploma', min_years: null, fresh_grad: true, nature: ['community-programmes'], org_type: 'charity', posted_at: '2026-11-15', closes_at: null }),
];

test('filters and sorts', () => {
  assert.deepEqual(filterJobs(sample, { fresh: true }).map(j => j.id), ['b', 'c']);
  assert.deepEqual(filterJobs(sample, { qualification: ['masters', 'diploma'] }).map(j => j.id), ['b', 'c']);
  assert.deepEqual(filterJobs(sample, { maxYears: 1 }).map(j => j.id), ['b', 'c']);
  assert.deepEqual(filterJobs(sample, { orgType: ['healthcare'] }).map(j => j.id), ['b']);
  assert.deepEqual(filterJobs(sample, { nature: ['social-work'] }).map(j => j.id), ['a']);
  assert.deepEqual(filterJobs(sample, { skill: 'cbt' }).map(j => j.id), ['b']);
  assert.deepEqual(filterJobs(sample, { q: 'psychologist' }).map(j => j.id), ['b']);
  assert.deepEqual(sortJobs(sample, 'newest').map(j => j.id), ['b', 'c', 'a']);
  assert.deepEqual(sortJobs(sample, 'closing').map(j => j.id), ['b', 'a', 'c']);
  assert.deepEqual(sortJobs(sample, 'qualification').map(j => j.id), ['b', 'a', 'c']);
  assert.deepEqual(sortJobs(sample, 'qualification-asc').map(j => j.id), ['c', 'a', 'b']);
  assert.deepEqual(sortJobs(sample, 'experience').map(j => j.id), ['b', 'c', 'a']);
});

function browserJobs() {
  const src = readFileSync(new URL('../public/jobs/jobs.js', import.meta.url), 'utf8');
  const ctx: { SGSSJobs?: { filterJobs: typeof filterJobs; sortJobs: typeof sortJobs; card: (j: PublicJob, m: unknown, t: string) => string } } = {};
  runInNewContext(src, { globalThis: ctx, window: undefined });
  return ctx.SGSSJobs!;
}

test('the board page filters and sorts exactly like the server', () => {
  const client = browserJobs();
  const cases = [{}, { fresh: true }, { qualification: ['masters'] }, { maxYears: 0 }, { orgType: ['charity', 'healthcare'] }, { q: 'executive' }];
  for (const f of cases) for (const sort of ['newest', 'closing', 'qualification', 'qualification-asc', 'experience']) {
    assert.deepEqual(Array.from(client.filterJobs(sample, { ...f, sort }), j => j.id), filterJobs(sample, { ...f, sort }).map(j => j.id), JSON.stringify({ f, sort }));
  }
  const html = client.card(pub({ id: 'x', title: '<b>Hi</b>', apply_url: 'https://e.org/"onload="x' }), { orgTypes: [], qualifications: [], natures: [] }, '2026-11-24');
  assert.ok(!html.includes('<b>Hi</b>'));
  assert.ok(html.includes('href="https://e.org/&quot;onload=&quot;x"'));
});

test('submitted jobs link directly to the original listing instead of a local job page', () => {
  const html = browserJobs().card(pub({ id: 'submitted-example', external_listing: true, apply_url: 'https://employer.example/role' }),
    { orgTypes: [], qualifications: [], natures: [] }, '2026-11-24');
  assert.ok(html.includes('href="https://employer.example/role" target="_blank" rel="noopener noreferrer"'));
  assert.ok(html.includes('View original listing'));
  assert.ok(!html.includes('/jobs/submitted-example'));
});

test('salary brackets match overlapping monthly pay and seniority matches minimum years', () => {
  const listings = [
    pub({ id: 'below', salary_min: 2800, salary_max: 2999, min_years: 0 }),
    pub({ id: 'boundary', salary_min: 3000, salary_max: 3000, min_years: 1 }),
    pub({ id: 'mid', salary_min: 4000, salary_max: 4500, min_years: 2 }),
    pub({ id: 'overlaps', salary_min: 4900, salary_max: 5100, min_years: 4 }),
    pub({ id: 'senior', salary_min: null, salary_max: 6000, salary_type: ' monthly ', min_years: 5 }),
    pub({ id: 'hourly', salary_type: 'Hourly', min_years: null }),
    pub({ id: 'no-period', salary_type: '', min_years: null }),
    pub({ id: 'no-pay', salary_min: null, salary_max: null, min_years: null }),
  ];
  const cases: [Parameters<typeof filterJobs>[1], string[]][] = [
    [{ salaryBracket: 'under-3000' }, ['below']],
    [{ salaryBracket: '3000-3999' }, ['boundary']],
    [{ salaryBracket: '4000-4999' }, ['mid', 'overlaps']],
    [{ salaryBracket: '5000-5999' }, ['overlaps']],
    [{ salaryBracket: '6000-plus' }, ['senior']],
    [{ seniority: 'entry' }, ['below', 'boundary']],
    [{ seniority: 'mid' }, ['mid', 'overlaps']],
    [{ seniority: 'senior' }, ['senior']],
    [{ seniority: 'unspecified' }, ['hourly', 'no-period', 'no-pay']],
    [{ salaryBracket: '4000-4999', seniority: 'mid', maxYears: 2, q: 'social' }, ['mid']],
    [{ salaryBracket: '6000-plus', seniority: 'entry' }, []],
  ];
  for (const filter of [filterJobs, browserJobs().filterJobs]) {
    for (const [options, ids] of cases) {
      assert.deepEqual(Array.from(filter(listings, options), job => job.id), ids, JSON.stringify(options));
    }
  }
});

test('experience ranges include their endpoints and exclude unstated experience', () => {
  const listings = [null, 0, 3, 4, 5, 7, 8, 12, 15, 16].map(years =>
    pub({ id: String(years), min_years: years }));
  const ranges = [
    ['0-3', ['0', '3']], ['5-7', ['5', '7']], ['8-12', ['8', '12']],
    ['12-15', ['12', '15']], ['over-15', ['16']],
  ] as const;
  for (const filter of [filterJobs, browserJobs().filterJobs]) {
    for (const [experienceRange, ids] of ranges) {
      assert.deepEqual(Array.from(filter(listings, { experienceRange }), job => job.id), ids);
    }
    assert.equal(filter(listings, { experienceRange: '' }).length, listings.length);
  }
});

test('Graduate Diploma filter matches a stated requirement or accepted alternative', () => {
  const job = mapMcfJob(mcf())!;
  const listings = [
    pub({ id: 'required', qualification: 'graduate-diploma' }),
    toPublic({ ...job, id: 'alternative', qualification: 'bachelors', requirements: 'Degree or Graduate Diploma in Counselling.' }),
    toPublic({ ...job, id: 'preferred', qualification: 'bachelors', requirements: 'Degree required. Graduate Diploma preferred.' }),
    pub({ id: 'ordinary', qualification: 'diploma' }),
  ];
  for (const filter of [filterJobs, browserJobs().filterJobs]) {
    assert.deepEqual(Array.from(filter(listings, { qualification: ['graduate-diploma'] }), job => job.id).sort(), ['alternative', 'required']);
  }
});

test('entry-level checkboxes match fresh-grad jobs and internship or practicum roles, not locum alone', () => {
  const listings = [
    pub({ id: 'intern', title: 'Youth Work Intern' }),
    pub({ id: 'internship', title: 'Social Work Internship' }),
    pub({ id: 'practicum', title: 'Counselling Practicum', fresh_grad: true }),
    pub({ id: 'locum', title: 'Locum Physiotherapist' }),
    pub({ id: 'locum-tagged', title: 'Therapy Assistant', employment_type: 'Part Time, Locum' }),
    pub({ id: 'tagged', title: 'Care Support', employment_type: 'Part Time, Internship' }),
    pub({ id: 'tagged-practicum', title: 'Counselling Trainee', employment_type: 'Practicum' }),
    pub({ id: 'graduate', title: 'Social Worker', fresh_grad: true, summary: 'Internship or practicum experience preferred.' }),
    pub({ id: 'coordinator', title: 'Internship Programme Coordinator' }),
    pub({ id: 'supervisor', title: 'Practicum Placement Supervisor' }),
    pub({ id: 'internal', title: 'Internal Communications Officer' }),
  ];
  const cases: [Parameters<typeof filterJobs>[1], string[]][] = [
    [{ internship: true }, ['tagged', 'practicum', 'tagged-practicum', 'internship', 'intern']],
    [{ fresh: true }, ['practicum', 'graduate']],
    [{ fresh: true, internship: true }, ['tagged', 'practicum', 'tagged-practicum', 'internship', 'graduate', 'intern']],
    [{ internship: true, q: 'counselling' }, ['practicum', 'tagged-practicum']],
  ];
  for (const filter of [filterJobs, browserJobs().filterJobs]) {
    for (const [options, ids] of cases) {
      assert.deepEqual(Array.from(filter(listings, options), job => job.id), ids, JSON.stringify(options));
    }
  }
});

test('job type checkboxes match any selected type and combine with other filter groups', () => {
  const listings = [
    pub({ id: 'full', title: 'Care Coordinator', employment_type: 'Permanent, Full Time', fresh_grad: true }),
    pub({ id: 'part-locum', title: 'Community Nurse', employment_type: 'Part-Time, Locum' }),
    pub({ id: 'contract', title: 'Youth Worker', employment_type: 'Contract (hourly pay)' }),
    pub({ id: 'freelance', title: 'Psychologist', employment_type: 'Part Time, Freelance', fresh_grad: true }),
    pub({ id: 'locum-title', title: 'Locum Physiotherapist', employment_type: '' }),
    pub({ id: 'other', title: 'Contract Manager', employment_type: 'Full–Time', summary: 'Works with freelance therapists.' }),
  ];
  const cases: [Parameters<typeof filterJobs>[1], string[]][] = [
    [{ jobType: ['full-time'] }, ['full', 'other']],
    [{ jobType: ['part-time'] }, ['freelance', 'part-locum']],
    [{ jobType: ['locum'] }, ['locum-title', 'part-locum']],
    [{ jobType: ['contract'] }, ['contract']],
    [{ jobType: ['freelance'] }, ['freelance']],
    [{ jobType: ['part-time', 'locum'] }, ['freelance', 'locum-title', 'part-locum']],
    [{ jobType: ['part-time', 'contract'], fresh: true }, ['freelance']],
    [{ jobType: [] }, ['contract', 'freelance', 'full', 'locum-title', 'other', 'part-locum']],
  ];
  for (const filter of [filterJobs, browserJobs().filterJobs]) {
    for (const [options, ids] of cases) {
      assert.deepEqual(Array.from(filter(listings, options), job => job.id).sort(), ids, JSON.stringify(options));
    }
  }
});

test('ids are readable and stable', () => {
  assert.equal(jobId('Senior Social Worker (Family)', 'CARE CORNER SINGAPORE LTD', 'abcdef1234'), 'senior-social-worker-family-care-corner-abcdef12');
  assert.equal(titleCase('KK WOMEN\'S AND CHILDREN\'S HOSPITAL PTE. LTD.'), 'KK Women\'s and Children\'s Hospital Pte. Ltd.');
});

test('sync collects across pages, de-duplicates, and reports failed searches', async () => {
  const page = (n: number, start = 0) => Array.from({ length: n }, (_, i) => mcf({ uuid: `u${start + i}` }));
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    const u = new URL(url), term = u.searchParams.get('search'), p = Number(u.searchParams.get('page'));
    if (term === 'broken') return new Response('nope', { status: 500 });
    if (term === 'social worker') return Response.json({ results: p === 0 ? page(100) : page(5, 100) });
    return Response.json({ results: [...page(3), mcf({ uuid: 'closed', status: { jobStatus: 'Closed' } }), mcf({ uuid: 'eng', title: 'Engineer', categories: [{ category: 'Engineering' }] })] });
  };
  const got = await collectMcfJobs({ fetch, today: '2026-11-24', terms: ['social worker', 'counsellor', 'broken'], delayMs: 0 });
  assert.equal(got.records.length, 105);
  assert.deepEqual(got.failedSearches, ['broken']);
  assert.equal(got.complete, false);
  assert.equal(calls.filter(c => c.includes('social%20worker')).length, 2);
  assert.ok(calls.every(c => c.startsWith('https://api.mycareersfuture.gov.sg/v2/jobs?')));
});
