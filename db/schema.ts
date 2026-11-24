import { boolean, check, date, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const submissions = pgTable('submissions', {
  id: text('id').primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  status: text('status').notNull().default('new'),
  kind: text('kind').notNull(),
  name: text('name').notNull().default(''),
  org: text('org').notNull().default(''),
  category: text('category').notNull().default(''),
  phone: text('phone').notNull().default(''),
  web: text('web').notNull().default(''),
  service_id: text('service_id').notNull().default(''),
  details: text('details').notNull(),
  role: text('role').notNull().default(''),
}, table => [
  check('submissions_kind', sql`${table.kind} in ('recommend', 'update')`),
  check('submissions_status', sql`${table.status} in ('new', 'done', 'rejected')`),
  check('submissions_details_required', sql`length(trim(${table.details})) > 0`),
  check('submissions_name_required', sql`${table.kind} <> 'recommend' or length(trim(${table.name})) > 0`),
  index('submissions_created_at_idx').on(table.created_at),
]);

// Site usage, counted per day. Privacy-friendly by design: only counters are stored.
// No cookies, IP addresses, browser details, search words or case text are ever saved.
//   metric: visit, pageview, search, search_no_results, filter, assistant,
//           profile (optional pop-up answer, key "role:agency"), profile_shown, profile_skip, assistant_role,
//           visitor_day / visitor_new / visitor_month (one per browser per day, ever, or month),
//           country (key: two-letter country of a visit, from Netlify; no IP stored), assistant_capped,
//           jobs_assistant / jobs_assistant_capped (the jobs board assistant, counted separately)
//   key:    what the count is about, e.g. "home", "help:legal-help" or a category id ("" if none)
//   source: "web" for the website ("app" is reserved for the mobile apps)
export const usageDaily = pgTable('usage_daily', {
  day: date('day', { mode: 'string' }).notNull(),
  source: text('source').notNull().default('web'),
  metric: text('metric').notNull(),
  key: text('key').notNull().default(''),
  count: integer('count').notNull().default(0),
}, table => [
  primaryKey({ columns: [table.day, table.source, table.metric, table.key] }),
  check('usage_daily_metric', sql`${table.metric} in ('visit', 'pageview', 'search', 'search_no_results', 'filter', 'assistant', 'profile', 'profile_shown', 'profile_skip', 'assistant_role', 'visitor_day', 'visitor_new', 'visitor_month', 'country', 'assistant_capped', 'jobs_assistant', 'jobs_assistant_capped')`),
  check('usage_daily_count_positive', sql`${table.count} >= 0`),
  index('usage_daily_day_idx').on(table.day),
]);

// Jobs board (/jobs/). Open roles in Singapore's social and health services.
// Filled automatically from MyCareersFuture every day (netlify/lib/jobs-sync.mts), plus any roles
// added by hand on /admin/jobs.html (e.g. from Careers@Gov or an employer's own careers page).
// A job is shown only while status is 'open' and its closing date hasn't passed.
export const JOB_QUALIFICATIONS = ['doctorate', 'masters', 'honours', 'bachelors', 'diploma', 'unspecified'] as const;
export const JOB_ORG_TYPES = ['healthcare', 'social-community', 'government', 'education', 'charity'] as const;
export const jobs = pgTable('jobs', {
  id: text('id').primaryKey(), // also the page address: /jobs/<id>
  source: text('source').notNull(), // 'mycareersfuture' or 'manual'
  source_id: text('source_id').notNull(), // the portal's own id (for manual jobs, the same as id)
  source_name: text('source_name').notNull().default(''), // shown to readers, e.g. "MyCareersFuture", "Careers@Gov"
  title: text('title').notNull(),
  org: text('org').notNull(),
  org_uen: text('org_uen').notNull().default(''),
  org_type: text('org_type').notNull().default('social-community'),
  location: text('location').notNull().default('Singapore'),
  employment_type: text('employment_type').notNull().default(''),
  salary_min: integer('salary_min'),
  salary_max: integer('salary_max'),
  salary_type: text('salary_type').notNull().default(''),
  summary: text('summary').notNull().default(''),
  description: text('description').notNull().default(''), // plain text: "## " headings, "- " bullets
  requirements: text('requirements').notNull().default(''),
  qualification: text('qualification').notNull().default('unspecified'),
  min_years: integer('min_years'),
  fresh_grad: boolean('fresh_grad').notNull().default(false),
  nature: text('nature').array().notNull().default(sql`'{}'::text[]`),
  skills: text('skills').array().notNull().default(sql`'{}'::text[]`),
  apply_url: text('apply_url').notNull(),
  source_url: text('source_url').notNull().default(''),
  posted_at: date('posted_at', { mode: 'string' }),
  closes_at: date('closes_at', { mode: 'string' }),
  closing_date_estimated: boolean('closing_date_estimated').notNull().default(false),
  status: text('status').notNull().default('open'),
  curated: boolean('curated').notNull().default(false),
  last_seen_at: timestamp('last_seen_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [
  uniqueIndex('jobs_source_id_idx').on(table.source, table.source_id),
  index('jobs_status_closes_idx').on(table.status, table.closes_at),
  check('jobs_source', sql`${table.source} in ('mycareersfuture', 'manual')`),
  check('jobs_status', sql`${table.status} in ('open', 'closed')`),
  check('jobs_qualification', sql`${table.qualification} in ('doctorate', 'masters', 'honours', 'graduate-diploma', 'bachelors', 'diploma', 'unspecified')`),
  check('jobs_org_type', sql`${table.org_type} in ('healthcare', 'social-community', 'government', 'education', 'charity')`),
  check('jobs_apply_url_https', sql`${table.apply_url} like 'https://%'`),
  check('jobs_title_required', sql`length(trim(${table.title})) > 0`),
]);
