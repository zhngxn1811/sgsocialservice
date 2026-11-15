// GET /api/stats?days=30   site numbers for the /admin/stats dashboard (admin key required)
import type { Config } from "@netlify/functions";
import { and, gte, lte } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { submissions, usageDaily } from "../../db/schema.js";
import { periodFor, summarise } from "../lib/usage.mjs";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const isAdmin = (req: Request) => {
  const key = Netlify.env.get("ADMIN_KEY");
  return !!key && req.headers.get("x-admin-key") === key;
};

export default async (req: Request) => {
  if (req.method !== "GET") return json(405, { error: "Use GET." });
  if (!isAdmin(req)) return json(401, { error: "Wrong admin key." });
  const asked = Number(new URL(req.url).searchParams.get("days"));
  const days = [7, 30, 90].includes(asked) ? asked : 30;
  const period = periodFor(days);
  try {
    const db = getDb();
    const rows = await db.select().from(usageDaily)
      .where(and(gte(usageDaily.day, period.prevFrom), lte(usageDaily.day, period.to)));
    const subs = await db.select({ created_at: submissions.created_at, kind: submissions.kind }).from(submissions)
      .where(gte(submissions.created_at, `${period.prevFrom}T00:00:00+08:00`));
    return json(200, { ...summarise(rows, subs, period), generatedAt: new Date().toISOString() });
  } catch {
    return json(500, { error: "Couldn't load the numbers. Try again in a moment." });
  }
};

export const config: Config = { path: "/api/stats" };
