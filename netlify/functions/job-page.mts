// GET /jobs/<id>: the page for one job, with its description, requirements and an Apply button
// that opens the application page on the job portal. Closed jobs answer 410 so search engines drop them.
import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { jobs } from "../../db/schema.js";
import { renderJobPage, renderNotFound } from "../lib/job-page.mjs";
import type { JobRecord } from "../lib/jobs.mjs";
import { sgDay } from "../lib/usage.mjs";

const page = (status: number, html: string, cache: string) => new Response(html, {
  status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": cache },
});

export default async (req: Request, context: Context) => {
  const id = String(context.params?.id || "");
  const base = (Netlify.env.get("SITE_URL") || Netlify.env.get("URL") || new URL(req.url).origin).replace(/\/$/, "");
  if (!/^[a-z0-9-]{3,140}$/.test(id)) return page(404, renderNotFound(base), "public, max-age=300");
  try {
    const [job] = await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1) as JobRecord[];
    if (!job || job.source === "submission") return page(404, renderNotFound(base), "public, max-age=300");
    const { status, html } = renderJobPage(job, base, sgDay());
    return page(status, html, "public, max-age=600");
  } catch {
    return page(503, renderNotFound(base, "This job couldn't load", "Something went wrong on our side. Try again in a moment, or"), "no-store");
  }
};

// preferStatic: the board's own files in /jobs/ (index.html, jobs.js, jobs.css) are served as files first.
export const config: Config = { path: "/jobs/:id", preferStatic: true };
