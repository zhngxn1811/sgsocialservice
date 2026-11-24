// GET   /api/jobs              open jobs for the board (public). Filtering and sorting happen in the browser.
// GET   /api/jobs?all=1        every job, open or closed  (admin: x-admin-key header)
// POST  /api/jobs              add a job by hand           (admin)
// PATCH /api/jobs/:id          { status: "open" | "closed" } (admin)
import type { Config, Context } from "@netlify/functions";
import { and, asc, desc, eq, gte, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { jobs } from "../../db/schema.js";
import { withCors } from "../lib/cors.mjs";
import { NATURES, ORG_TYPES, QUALIFICATIONS, SORTS, isLive, manualJob, sortJobs, toPublic, type JobRecord } from "../lib/jobs.mjs";
import { orgOverrides } from "../lib/jobs-sync.mjs";
import { sgDay } from "../lib/usage.mjs";

const json = (status: number, body: unknown, cache = "no-store") => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": cache },
});
// Filter labels for the board, so the page and the server always use the same names.
const META = {
  qualifications: QUALIFICATIONS.map(({ id, label }) => ({ id, label })),
  orgTypes: ORG_TYPES,
  natures: NATURES.map(({ id, label }) => ({ id, label })),
  sorts: SORTS,
};
const isAdmin = (req: Request) => {
  const key = Netlify.env.get("ADMIN_KEY");
  return !!key && req.headers.get("x-admin-key") === key;
};

export default withCors(async (req: Request, context: Context) => {
  const id = context.params?.id;
  const url = new URL(req.url);
  const today = sgDay();

  if (req.method === "GET" && !id && url.searchParams.get("all") !== "1") {
    try {
      const rows = await getDb().select().from(jobs).where(eq(jobs.status, "open")) as JobRecord[];
      const live = sortJobs(rows.filter(j => isLive(j, today)).map(toPublic), "newest");
      return json(200, { updated: today, total: live.length, meta: META, jobs: live }, "public, max-age=300");
    } catch {
      return json(500, { error: "Couldn't load jobs. Try again in a moment." });
    }
  }

  if (!isAdmin(req)) return json(401, { error: "Wrong admin key." });

  try {
    const db = getDb();
    if (req.method === "GET" && !id) {
      const queue = url.searchParams.get("queue");
      const summary = { id: jobs.id, title: jobs.title, org: jobs.org, apply_url: jobs.apply_url };
      if (queue === "submissions") {
        return json(200, await db.select({ ...summary, description: jobs.description, requirements: jobs.requirements,
          closes_at: jobs.closes_at, closing_date_estimated: jobs.closing_date_estimated }).from(jobs)
          .where(and(eq(jobs.source, "submission"), eq(jobs.status, "pending"))).orderBy(asc(jobs.updated_at)).limit(20));
      }
      if (queue === "unavailable") {
        return json(200, await db.select({ ...summary, link_checked_at: jobs.link_checked_at, link_missing_code: jobs.link_missing_code })
          .from(jobs).where(and(eq(jobs.status, "open"), gte(jobs.link_missing_count, 2),
          or(isNull(jobs.closes_at), gte(jobs.closes_at, today)))).orderBy(desc(jobs.link_checked_at)).limit(2000));
      }
      if (queue === "board") {
        return json(200, await db.select({ ...summary, org_type: jobs.org_type, nature: jobs.nature, qualification: jobs.qualification,
          min_years: jobs.min_years, fresh_grad: jobs.fresh_grad, closes_at: jobs.closes_at, closing_date_estimated: jobs.closing_date_estimated,
          source_name: jobs.source_name, source: jobs.source, status: jobs.status,
          external_listing: sql<boolean>`(${jobs.source} = 'submission' and ${jobs.description} = '' and ${jobs.requirements} = '')`,
        }).from(jobs).where(ne(jobs.status, "pending")).orderBy(desc(jobs.updated_at)).limit(2000));
      }
      return json(200, await db.select().from(jobs).orderBy(desc(eq(jobs.status, "pending")), desc(jobs.updated_at)).limit(2000));
    }
    if (req.method === "POST" && !id) {
      let body: Record<string, unknown>;
      try { body = await req.json(); } catch { return json(400, { error: "Send the job as JSON." }); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Send the job as JSON." });
      const made = manualJob(body, today, orgOverrides);
      if ("error" in made) return json(400, { error: made.error });
      await db.insert(jobs).values(made.job);
      return json(201, { ok: true, id: made.job.id });
    }
    if (req.method === "PATCH" && id) {
      let status: unknown = null;
      try { status = (await req.json())?.status; } catch {}
      if (status !== "open" && status !== "closed") return json(400, { error: "Status must be open or closed." });
      const target = status === "open"
        ? and(eq(jobs.id, id), or(ne(jobs.source, "submission"), gte(jobs.closes_at, today)))
        : eq(jobs.id, id);
      const updated = await db.update(jobs).set({ status, updated_at: new Date().toISOString() }).where(target).returning({ id: jobs.id });
      if (!updated.length) return json(404, { error: status === "open" ? "Job not found or its listing date has passed." : "Job not found." });
      return json(200, { ok: true });
    }
  } catch {
    return json(500, { error: "Couldn't update jobs. Try again in a moment." });
  }
  return json(405, { error: "Not supported." });
});

export const config: Config = { path: ["/api/jobs", "/api/jobs/:id"] };
