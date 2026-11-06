import { check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
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
