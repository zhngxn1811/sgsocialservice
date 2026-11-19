// POST /api/track   counts visits, page views, searches and filter use (public, from the site)
// Body: { "events": [{ "metric": "pageview", "key": "home" }] }, sent as text so no pre-check is needed.
// Stores daily counters only. No cookies, IP addresses, browser details or search words are kept.
// For visits, the country (e.g. "sg") is counted too.
import type { Config, Context } from "@netlify/functions";
import { getDb } from "../../db/index.js";
import { cleanEvents, countryKey, isBot, recordUsage } from "../lib/usage.mjs";

const done = (status = 204) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

export default async (req: Request, context?: Context) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Use POST." }), { status: 405, headers: { "Content-Type": "application/json" } });
  if (isBot(req.headers.get("user-agent"))) return done();
  let body: unknown;
  try { body = JSON.parse(await req.text()); } catch { return done(400); }
  const events = cleanEvents(body);
  if (!events.length) return done();
  // Each visit also adds 1 to its country's count. Netlify works out the country; the IP address itself is never stored.
  if (events.some(e => e.metric === "visit")) events.push({ metric: "country", key: countryKey(context?.geo?.country?.code) });
  try { await recordUsage(getDb(), events); } catch { /* counting must never break the site */ }
  return done();
};

export const config: Config = {
  path: "/api/track",
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
