// Refreshes the jobs board from MyCareersFuture. A background function, so it can run for several minutes.
// Started every morning by jobs-sync-scheduled.mts, or by "Refresh jobs now" on /admin/jobs.html.
// POST /.netlify/functions/jobs-sync-background with the x-admin-key header (your ADMIN_KEY).
import type { Config } from "@netlify/functions";
import { getDb } from "../../db/index.js";
import { runSync } from "../lib/jobs-sync.mjs";
import { sgDay } from "../lib/usage.mjs";

export default async (req: Request) => {
  const key = Netlify.env.get("ADMIN_KEY");
  if (req.method !== "POST" || !key || req.headers.get("x-admin-key") !== key) return new Response("Not allowed", { status: 401 });
  try {
    const result = await runSync(getDb(), sgDay(), { userAgent: `SGSocialServices-JobsBoard/1.0 (+${Netlify.env.get("URL") || ""}/jobs/)` });
    console.log("jobs sync", JSON.stringify(result));
  } catch (e) {
    console.error("jobs sync failed", e instanceof Error ? e.message : "unknown error");
  }
  return new Response(null, { status: 202 });
};

export const config: Config = {};
