// Privacy-friendly usage counting, shared by /api/track, /api/stats and the assistant.
// Only adds 1 to a daily counter. Nothing that identifies a person is read into storage.
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { usageDaily } from "../../db/schema.js";

export const METRICS = ["visit", "pageview", "search", "search_no_results", "filter", "assistant", "profile", "profile_shown", "profile_skip", "assistant_role",
  "visitor_day", "visitor_new", "visitor_month", "country", "assistant_capped"] as const;
// Counted on the server only. The browser can't send these.
const SERVER_ONLY = new Set(["assistant", "country", "assistant_capped"]);
// Sent once per browser (per day, ever, or per month). The browser only remembers the date it last sent them.
const VISITOR = new Set(["visitor_day", "visitor_new", "visitor_month"]);

// Answer options for the optional "who's using this" pop-up (public/profile.js shows the same list; a test keeps them in step).
// Broad categories only, so no answer can point to one person.
export const ROLES = {
  "social-worker": "Social worker",
  "counsellor": "Counsellor",
  "case-manager": "Case manager or caseworker",
  "psychologist": "Psychologist or therapist",
  "school": "Teacher or school staff",
  "healthcare": "Nurse, doctor or allied health",
  "student": "Student or trainee",
  "volunteer": "Volunteer or befriender",
  "public": "Member of the public",
  "other": "Other",
  "undisclosed": "Prefer not to say",
} as const;
export const AGENCIES = {
  "fsc": "Family Service Centre",
  "ssa": "Other social service agency or charity",
  "hospital": "Hospital or healthcare",
  "school": "School or institute of higher learning",
  "government": "Government agency",
  "private": "Private practice",
  "eap": "Employee assistance or corporate",
  "community": "Community, grassroots or faith-based",
  "none": "Not with an organisation",
  "other": "Other",
  "undisclosed": "Prefer not to say",
} as const;
const isRole = (k: string) => Object.hasOwn(ROLES, k);
const isAgency = (k: string) => Object.hasOwn(AGENCIES, k);
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
    if (typeof metric !== "string" || !(METRICS as readonly string[]).includes(metric) || SERVER_ONLY.has(metric)) continue;
    if (typeof key !== "string" || (key !== "" && !KEY.test(key))) continue;
    // Pop-up answers must be from the fixed lists; anything else is dropped.
    if (metric === "profile") { const [role, agency, extra] = key.split(":"); if (extra !== undefined || !isRole(role) || !isAgency(agency)) continue; }
    if (metric === "assistant_role" && !isRole(key)) continue;
    if ((metric === "profile_shown" || metric === "profile_skip" || VISITOR.has(metric)) && key !== "") continue;
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

// Turns the two-letter country Netlify gives each request into a counter key ("sg", "my"…).
// Only the country is kept, never the IP address or anything finer. Unknown or odd values become "xx".
export function countryKey(code: unknown): string {
  return typeof code === "string" && /^[A-Za-z]{2}$/.test(code) ? code.toLowerCase() : "xx";
}

// Daily cap on assistant uses across the whole site, so a bot or a bad day can't run up the AI bill.
// Set ASSISTANT_DAILY_CAP in Netlify (0 switches the cap off). Resets at midnight Singapore time.
export const DEFAULT_ASSISTANT_CAP = 150;
const envCap = (): string | undefined => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.ASSISTANT_DAILY_CAP;
export function assistantDailyCap(raw: string | undefined = envCap()): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_ASSISTANT_CAP;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_ASSISTANT_CAP;
}
type ReadDb = { select: (cols: any) => any };
export async function assistantUsedToday(db: ReadDb, day = sgDay()): Promise<number> {
  const [row] = await db.select({ n: sql<number>`coalesce(sum(${usageDaily.count}), 0)::int` }).from(usageDaily)
    .where(and(eq(usageDaily.day, day), eq(usageDaily.metric, "assistant")));
  return Number(row?.n ?? 0);
}
// True when today's uses have reached the cap. If the count can't be read, the assistant stays open.
export async function assistantCapReached(cap = assistantDailyCap(), day = sgDay()): Promise<boolean> {
  if (!cap) return false;
  try { return (await assistantUsedToday(getDb(), day)) >= cap; } catch { return false; }
}

// Counts one use of a server-side feature (the assistant). Never sees or stores what was asked.
// Errors are swallowed: counting must never delay or break the feature itself.
export function countServerUse(metric: "assistant" | "assistant_capped", waitUntil?: (p: Promise<unknown>) => void): void {
  let p: Promise<unknown>;
  try { p = recordUsage(getDb(), [{ metric, key: "" }]).catch(() => {}); } catch { return; }
  waitUntil?.(p);
}

// ---------- reading the numbers back (/api/stats) ----------

export type UsageRow = { day: string; source: string; metric: string; key: string; count: number };
export type SubmissionRow = { created_at: string; kind: string; status?: string };
const TOTAL_KEYS = ["visits", "pageviews", "searches", "noResults", "assistant", "submissions", "profiles", "profileShown", "profileSkips", "visitorDays", "newVisitors", "assistantCapped"] as const;
type Totals = Record<(typeof TOTAL_KEYS)[number], number>;
const METRIC_TO_TOTAL: Record<string, keyof Totals> = {
  visit: "visits", pageview: "pageviews", search: "searches", search_no_results: "noResults", assistant: "assistant",
  profile: "profiles", profile_shown: "profileShown", profile_skip: "profileSkips",
  visitor_day: "visitorDays", visitor_new: "newVisitors", assistant_capped: "assistantCapped",
};

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// The current period ends today (Singapore time). The previous period is the same length, just before it.
export function periodFor(days: number, today = sgDay()) {
  const from = addDays(today, -(days - 1));
  const prevFrom = addDays(from, -days), monthFrom = `${today.slice(0, 7)}-01`;
  // readFrom: the earliest day the dashboard needs, so "unique visitors this month" works for a 7-day view too.
  return { days, from, to: today, prevFrom, prevTo: addDays(from, -1), monthFrom, readFrom: monthFrom < prevFrom ? monthFrom : prevFrom };
}

type Count = { key: string; label: string; count: number };
const labelled = (m: Map<string, number>, labels: Record<string, string>): Count[] =>
  [...m].map(([key, count]) => ({ key, label: labels[key] ?? key, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

export function summarise(rows: UsageRow[], subs: SubmissionRow[], period: ReturnType<typeof periodFor>) {
  const zero = (): Totals => ({ visits: 0, pageviews: 0, searches: 0, noResults: 0, assistant: 0, submissions: 0, profiles: 0, profileShown: 0, profileSkips: 0, visitorDays: 0, newVisitors: 0, assistantCapped: 0 });
  const totals = zero(), previous = zero();
  const daily = new Map<string, Totals & { day: string }>();
  for (let d = period.from; d <= period.to; d = addDays(d, 1)) daily.set(d, { day: d, ...zero() });
  const pages = new Map<string, number>(), filters = new Map<string, number>();
  const roles = new Map<string, number>(), agencies = new Map<string, number>(), assistantByRole = new Map<string, number>();
  const combos = new Map<string, number>(), countries = new Map<string, number>();
  let uniqueThisMonth = 0;
  const inCurrent = (d: string) => d >= period.from && d <= period.to;
  const inPrevious = (d: string) => d >= period.prevFrom && d <= period.prevTo;
  const bump = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

  for (const r of rows) {
    const n = Number(r.count) || 0;
    const field = METRIC_TO_TOTAL[r.metric];
    if (r.metric === "visitor_month" && r.day >= period.monthFrom && r.day <= period.to) uniqueThisMonth += n;
    if (inCurrent(r.day)) {
      if (field) { totals[field] += n; daily.get(r.day)![field] += n; }
      if (r.metric === "pageview" && r.key) bump(pages, r.key, n);
      if (r.metric === "filter" && r.key) bump(filters, r.key, n);
      if (r.metric === "profile" && r.key) {
        const [role, agency] = r.key.split(":");
        bump(roles, role, n); bump(agencies, agency, n); bump(combos, r.key, n);
      }
      if (r.metric === "assistant_role" && r.key) bump(assistantByRole, r.key, n);
      if (r.metric === "country" && r.key) bump(countries, r.key, n);
    } else if (inPrevious(r.day) && field) previous[field] += n;
  }
  const submissionsByKind = { recommend: 0, update: 0 };
  for (const s of subs) {
    const day = sgDay(new Date(s.created_at));
    if (inCurrent(day)) {
      totals.submissions += 1; daily.get(day)!.submissions += 1;
      if (s.kind === "recommend" || s.kind === "update") submissionsByKind[s.kind] += 1;
    } else if (inPrevious(day)) previous.submissions += 1;
  }
  const sorted = (m: Map<string, number>) => [...m].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const asked = totals.profiles + totals.profileSkips;
  return {
    range: period, totals, previous, daily: [...daily.values()], pages: sorted(pages), filters: sorted(filters),
    visitors: {
      thisMonth: uniqueThisMonth,           // different browsers since the 1st of this month
      monthFrom: period.monthFrom,
      newInPeriod: totals.newVisitors,      // browsers seen for the first time in this period
      returningDays: Math.max(0, totals.visitorDays - totals.newVisitors),
      averagePerDay: Math.round(totals.visitorDays / period.days),
    },
    countries: sorted(countries),
    audience: {
      responses: totals.profiles,
      shown: totals.profileShown,
      skipped: totals.profileSkips,
      responseRate: totals.profileShown ? Math.round((totals.profiles / totals.profileShown) * 100) : null,
      answeredOfAsked: asked ? Math.round((totals.profiles / asked) * 100) : null,
      roles: labelled(roles, ROLES),
      agencies: labelled(agencies, AGENCIES),
      assistantByRole: labelled(assistantByRole, ROLES),
      combos: [...combos].map(([key, count]) => { const [r, a] = key.split(":"); return { role: ROLES[r as keyof typeof ROLES] ?? r, agency: AGENCIES[a as keyof typeof AGENCIES] ?? a, count }; })
        .sort((x, y) => y.count - x.count).slice(0, 10),
    },
    submissionsByKind,
  };
}
