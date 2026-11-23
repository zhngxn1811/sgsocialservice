// GET   /api/jobs              open jobs for the board (public). Filtering and sorting happen in the browser.
// GET   /api/jobs?all=1        every job, open or closed  (admin: x-admin-key header)
// POST  /api/jobs              add a job by hand           (admin)
// PATCH /api/jobs/:id          { status: "open" | "closed" } (admin)
import type { Config, Context } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
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
      return json(200, await db.select().from(jobs).orderBy(desc(jobs.updated_at)).limit(2000));
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
      const updated = await db.update(jobs).set({ status, updated_at: new Date().toISOString() }).where(eq(jobs.id, id)).returning({ id: jobs.id });
      if (!updated.length) return json(404, { error: "Job not found." });
      return json(200, { ok: true });
    }
  } catch {
    return json(500, { error: "Couldn't update jobs. Try again in a moment." });
  }
  return json(405, { error: "Not supported." });
});

export const config: Config = { path: ["/api/jobs", "/api/jobs/:id"] };
