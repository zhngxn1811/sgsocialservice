import { check, date, index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
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
//           country (key: two-letter country of a visit, from Netlify; no IP stored), assistant_capped
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
  check('usage_daily_metric', sql`${table.metric} in ('visit', 'pageview', 'search', 'search_no_results', 'filter', 'assistant', 'profile', 'profile_shown', 'profile_skip', 'assistant_role', 'visitor_day', 'visitor_new', 'visitor_month', 'country', 'assistant_capped')`),
  check('usage_daily_count_positive', sql`${table.count} >= 0`),
  index('usage_daily_day_idx').on(table.day),
]);
