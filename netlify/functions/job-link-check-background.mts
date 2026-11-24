import { and, asc, eq, gte, isNull, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { jobs } from "../../db/schema.js";
import { checkJobLink, linkCheckUpdate } from "../lib/job-link-check.mjs";
import { sgDay } from "../lib/usage.mjs";

export default async (req: Request) => {
  const key = Netlify.env.get("ADMIN_KEY");
  if (req.method !== "POST" || !key || req.headers.get("x-admin-key") !== key) return new Response(null, { status: 401 });

  const db = getDb();
  const today = sgDay();
  const dueBefore = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const live = and(eq(jobs.status, "open"), or(isNull(jobs.closes_at), gte(jobs.closes_at, today)));
  const due = or(isNull(jobs.link_checked_at), lt(jobs.link_checked_at, dueBefore));
  const rows = await db.select({ id: jobs.id, url: jobs.apply_url, count: jobs.link_missing_count })
    .from(jobs).where(and(live, due, ne(jobs.source, "mycareersfuture"), sql`${jobs.apply_url} like 'https://%'`))
    .orderBy(sql`${jobs.link_checked_at} asc nulls first`, asc(jobs.id)).limit(240);

  for (let offset = 0; offset < rows.length; offset += 8) {
    await Promise.all(rows.slice(offset, offset + 8).map(async job => {
      const status = await checkJobLink(job.url);
      await db.update(jobs).set({ link_checked_at: new Date().toISOString(), ...linkCheckUpdate(status, job.count) })
        .where(and(live, due, eq(jobs.id, job.id), eq(jobs.apply_url, job.url)));
    }));
  }
  return new Response(null, { status: 202 });
};
