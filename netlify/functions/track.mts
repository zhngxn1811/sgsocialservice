// POST /api/track   counts visits, page views, searches and filter use (public, from the site)
// Body: { "events": [{ "metric": "pageview", "key": "home" }] }, sent as text so no pre-check is needed.
// Stores daily counters only. No cookies, IP addresses, browser details or search words are kept.
import type { Config } from "@netlify/functions";
import { getDb } from "../../db/index.js";
import { cleanEvents, isBot, recordUsage } from "../lib/usage.mjs";

const done = (status = 204) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

export default async (req: Request) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Use POST." }), { status: 405, headers: { "Content-Type": "application/json" } });
  if (isBot(req.headers.get("user-agent"))) return done();
  let body: unknown;
  try { body = JSON.parse(await req.text()); } catch { return done(400); }
  const events = cleanEvents(body);
  if (!events.length) return done();
  try { await recordUsage(getDb(), events); } catch { /* counting must never break the site */ }
  return done();
};

export const config: Config = {
  path: "/api/track",
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
