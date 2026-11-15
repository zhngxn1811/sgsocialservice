// Privacy-friendly usage counting, shared by /api/track, /api/stats and the assistant.
// Only adds 1 to a daily counter. Nothing that identifies a person is read into storage.
import { sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { usageDaily } from "../../db/schema.js";

export const METRICS = ["visit", "pageview", "search", "search_no_results", "filter", "assistant"] as const;
export type Metric = (typeof METRICS)[number];
export type UsageEvent = { metric: Metric; key: string };

const KEY = /^[a-z0-9]([a-z0-9:-]{0,58}[a-z0-9])?$/;
export const MAX_EVENTS = 5;

// Days run on Singapore time, so "today" matches the dashboard reader's day.
export function sgDay(date = new Date()): string {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Search engines and link previewers shouldn't count as people.
export function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|linkedin|whatsapp|headless|lighthouse|monitor|curl|wget|python|node-fetch/i.test(userAgent);
}

// Keeps only known metrics with tidy keys. Anything else is dropped, not stored.
export function cleanEvents(input: unknown): UsageEvent[] {
  const list = input && typeof input === "object" && Array.isArray((input as { events?: unknown }).events)
    ? (input as { events: unknown[] }).events : [];
  const out: UsageEvent[] = [];
  for (const e of list.slice(0, MAX_EVENTS)) {
    if (!e || typeof e !== "object") continue;
    const metric = (e as { metric?: unknown }).metric;
    const key = (e as { key?: unknown }).key ?? "";
    if (typeof metric !== "string" || !(METRICS as readonly string[]).includes(metric) || metric === "assistant") continue; // assistant is counted on the server only
    if (typeof key !== "string" || (key !== "" && !KEY.test(key))) continue;
    out.push({ metric: metric as Metric, key });
  }
  return out;
}

type Db = { insert: (table: typeof usageDaily) => any };

export async function recordUsage(db: Db, events: UsageEvent[], source = "web", day = sgDay()): Promise<void> {
  // Fold repeats in one request into a single +n per counter.
  const counts = new Map<string, { metric: Metric; key: string; n: number }>();
  for (const e of events) {
    const id = `${e.metric}|${e.key}`;
    const c = counts.get(id) ?? { metric: e.metric, key: e.key, n: 0 };
    c.n += 1;
    counts.set(id, c);
  }
  for (const c of counts.values()) {
    await db.insert(usageDaily)
      .values({ day, source, metric: c.metric, key: c.key, count: c.n })
      .onConflictDoUpdate({
        target: [usageDaily.day, usageDaily.source, usageDaily.metric, usageDaily.key],
        set: { count: sql`${usageDaily.count} + ${c.n}` },
      });
  }
}

// Counts one use of a server-side feature (the assistant). Never sees or stores what was asked.
// Errors are swallowed: counting must never delay or break the feature itself.
export function countServerUse(metric: "assistant", waitUntil?: (p: Promise<unknown>) => void): void {
  let p: Promise<unknown>;
  try { p = recordUsage(getDb(), [{ metric, key: "" }]).catch(() => {}); } catch { return; }
  waitUntil?.(p);
}

// ---------- reading the numbers back (/api/stats) ----------

export type UsageRow = { day: string; source: string; metric: string; key: string; count: number };
export type SubmissionRow = { created_at: string; kind: string };
const TOTAL_KEYS = ["visits", "pageviews", "searches", "noResults", "assistant", "submissions"] as const;
type Totals = Record<(typeof TOTAL_KEYS)[number], number>;
const METRIC_TO_TOTAL: Record<string, keyof Totals> = {
  visit: "visits", pageview: "pageviews", search: "searches", search_no_results: "noResults", assistant: "assistant",
};

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// The current period ends today (Singapore time). The previous period is the same length, just before it.
export function periodFor(days: number, today = sgDay()) {
  const from = addDays(today, -(days - 1));
  return { days, from, to: today, prevFrom: addDays(from, -days), prevTo: addDays(from, -1) };
}

export function summarise(rows: UsageRow[], subs: SubmissionRow[], period: ReturnType<typeof periodFor>) {
  const zero = (): Totals => ({ visits: 0, pageviews: 0, searches: 0, noResults: 0, assistant: 0, submissions: 0 });
  const totals = zero(), previous = zero();
  const daily = new Map<string, Totals & { day: string }>();
  for (let d = period.from; d <= period.to; d = addDays(d, 1)) daily.set(d, { day: d, ...zero() });
  const pages = new Map<string, number>(), filters = new Map<string, number>();
  const inCurrent = (d: string) => d >= period.from && d <= period.to;
  const inPrevious = (d: string) => d >= period.prevFrom && d <= period.prevTo;

  for (const r of rows) {
    const n = Number(r.count) || 0;
    const field = METRIC_TO_TOTAL[r.metric];
    if (inCurrent(r.day)) {
      if (field) { totals[field] += n; daily.get(r.day)![field] += n; }
      if (r.metric === "pageview" && r.key) pages.set(r.key, (pages.get(r.key) ?? 0) + n);
      if (r.metric === "filter" && r.key) filters.set(r.key, (filters.get(r.key) ?? 0) + n);
    } else if (inPrevious(r.day) && field) previous[field] += n;
  }
  for (const s of subs) {
    const day = sgDay(new Date(s.created_at));
    if (inCurrent(day)) { totals.submissions += 1; daily.get(day)!.submissions += 1; }
    else if (inPrevious(day)) previous.submissions += 1;
  }
  const sorted = (m: Map<string, number>) => [...m].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return { range: period, totals, previous, daily: [...daily.values()], pages: sorted(pages), filters: sorted(filters) };
}
