// Daily jobs refresh: pulls open social and health services roles in Singapore from MyCareersFuture
// (the national jobs portal run by Workforce Singapore), saves them, and takes down jobs that have
// closed or been removed. Run by netlify/functions/jobs-sync-background.mts.
//
// Why only MyCareersFuture automatically: it has a public jobs feed with each job's status and expiry
// date, so we can tell when applications close. JobStreet, LinkedIn and Indeed don't allow automated
// copying in their terms, and Careers@Gov has no public feed. Add roles from those by hand on
// /admin/jobs.html with a closing date, and they come down on that date.
import { and, eq, lt } from "drizzle-orm";
import overridesFile from "../../content/job-org-types.json" with { type: "json" };
import { jobs } from "../../db/schema.js";
import { isOpenMcf, isRelevantMcf, mapMcfJob, type JobRecord, type McfJob } from "./jobs.mjs";

const API = "https://api.mycareersfuture.gov.sg/v2/jobs";

// Searches run against MyCareersFuture. Each brings back up to MAX_PAGES x 100 of the newest jobs.
export const SEARCH_TERMS = [
  "social worker", "medical social worker", "senior social worker", "social work associate",
  "counsellor", "school counsellor", "psychologist", "clinical psychologist", "educational psychologist",
  "case manager", "care coordinator", "youth worker", "programme executive social service",
  "community engagement executive", "befriender", "family service centre",
  "early intervention teacher", "special needs", "art therapist", "music therapist", "occupational therapist",
  "mental health", "peer support specialist", "caregiver support", "active ageing centre", "senior care centre",
];
export const MAX_PAGES = 3;
const PAGE_SIZE = 100;

export const orgOverrides: Record<string, string> = Object.fromEntries(
  Object.entries(overridesFile as Record<string, string>).filter(([k]) => !k.startsWith("_")),
);

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export type Collected = { records: JobRecord[]; fetched: number; failedSearches: string[]; complete: boolean };

// Fetches every search term and returns the open, relevant, de-duplicated jobs.
// complete is false if any search failed. Then we don't take down jobs we simply didn't see.
export async function collectMcfJobs(opts: {
  fetch?: Fetch; today: string; terms?: string[]; maxPages?: number; delayMs?: number; userAgent?: string;
}): Promise<Collected> {
  const doFetch = opts.fetch ?? fetch, terms = opts.terms ?? SEARCH_TERMS, maxPages = opts.maxPages ?? MAX_PAGES;
  const seen = new Map<string, JobRecord>(), failed: string[] = [];
  let fetched = 0;
  for (const term of terms) {
    for (let page = 0; page < maxPages; page++) {
      const url = `${API}?search=${encodeURIComponent(term)}&limit=${PAGE_SIZE}&page=${page}&sortBy=new_posting_date`;
      let results: McfJob[] = [];
      try {
        const res = await doFetch(url, { headers: { Accept: "application/json", "User-Agent": opts.userAgent ?? "SGSocialServices-JobsBoard/1.0" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json() as { results?: McfJob[] };
        results = Array.isArray(body?.results) ? body.results : [];
      } catch {
        failed.push(term);
        break;
      }
      fetched += results.length;
      for (const raw of results) {
        if (!raw?.uuid || seen.has(raw.uuid) || !isRelevantMcf(raw) || !isOpenMcf(raw, opts.today)) continue;
        const rec = mapMcfJob(raw, orgOverrides);
        if (rec) seen.set(raw.uuid, rec);
      }
      if (results.length < PAGE_SIZE) break;
      if (opts.delayMs !== 0) await wait(opts.delayMs ?? 400); // be polite to the portal
    }
  }
  return { records: [...seen.values()], fetched, failedSearches: [...new Set(failed)], complete: failed.length === 0 };
}

type Db = ReturnType<typeof import("../../db/index.js").getDb>;

// Saves (inserts or updates) the collected jobs, then closes:
//   - any job whose closing date has passed (portal or hand-added)
//   - portal jobs not seen in this run, but only if every search worked
export async function saveJobs(db: Db, records: JobRecord[], startedAt: string, today: string, complete: boolean) {
  let saved = 0;
  for (const r of records) {
    const { id, ...rest } = r;
    await db.insert(jobs).values({ id, ...rest, last_seen_at: startedAt, updated_at: startedAt })
      .onConflictDoUpdate({
        target: [jobs.source, jobs.source_id],
        set: { ...rest, status: "open", last_seen_at: startedAt, updated_at: startedAt }, // the id (page address) never changes
      });
    saved++;
  }
  const expired = await db.update(jobs).set({ status: "closed", updated_at: startedAt })
    .where(and(eq(jobs.status, "open"), lt(jobs.closes_at, today))).returning({ id: jobs.id });
  let gone: { id: string }[] = [];
  if (complete) {
    gone = await db.update(jobs).set({ status: "closed", updated_at: startedAt })
      .where(and(eq(jobs.status, "open"), eq(jobs.source, "mycareersfuture"), lt(jobs.last_seen_at, startedAt)))
      .returning({ id: jobs.id });
  }
  return { saved, closed: expired.length + gone.length };
}

export async function runSync(db: Db, today: string, opts: { fetch?: Fetch; delayMs?: number; userAgent?: string } = {}) {
  const startedAt = new Date().toISOString();
  const got = await collectMcfJobs({ today, fetch: opts.fetch, delayMs: opts.delayMs, userAgent: opts.userAgent });
  // If the portal couldn't be reached at all, change nothing.
  if (!got.fetched && !got.complete) return { ok: false, ...got, records: undefined, saved: 0, closed: 0 };
  const res = await saveJobs(db, got.records, startedAt, today, got.complete);
  return { ok: true, fetched: got.fetched, relevant: got.records.length, failedSearches: got.failedSearches, complete: got.complete, ...res };
}

