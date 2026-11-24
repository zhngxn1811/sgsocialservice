// "Hiring now" cards: organisations whose openings live on their own careers pages.
// The list is kept by hand in content/hiring-now.json. Each card hides itself
// HIRING_STALE_DAYS after it was last checked, so the board never shows stale employers.
import file from "../../content/hiring-now.json" with { type: "json" };
import { NATURES, ORG_TYPES, isHttpsUrl, type Nature, type OrgType } from "./jobs.mjs";

export const HIRING_STALE_DAYS = 120;

export type Employer = {
  id: string;
  name: string;
  org_type: OrgType;
  url: string;
  summary: string;
  roles: string[];
  areas: Nature[];
  checked: string;
  hide_after: string;
};

const ORG_IDS = new Set<string>(ORG_TYPES.map(o => o.id));
const NATURE_IDS = new Set<string>(NATURES.map(n => n.id));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Checks every entry and returns the problems, so a typo fails the tests instead of breaking the page.
export function checkEmployers(raw: unknown): { employers: Employer[]; problems: string[] } {
  const problems: string[] = [];
  const list = (raw as { employers?: unknown })?.employers;
  if (!Array.isArray(list)) return { employers: [], problems: ['The file needs an "employers" list.'] };
  const seen = new Set<string>();
  const employers: Employer[] = [];
  list.forEach((e: any, i) => {
    const where = `Entry ${i + 1}${e?.name ? ` (${e.name})` : ""}`;
    const bad: string[] = [];
    if (typeof e?.id !== "string" || !/^[a-z0-9-]{2,60}$/.test(e.id)) bad.push("id must be lowercase letters, numbers and dashes");
    else if (seen.has(e.id)) bad.push(`id "${e.id}" is used twice`);
    if (typeof e?.name !== "string" || !e.name.trim()) bad.push("name is missing");
    if (!ORG_IDS.has(e?.org_type)) bad.push(`org_type must be one of ${[...ORG_IDS].join(", ")}`);
    if (!isHttpsUrl(e?.url)) bad.push("url must start with https://");
    if (typeof e?.summary !== "string" || !e.summary.trim()) bad.push("summary is missing");
    if (!Array.isArray(e?.roles) || !e.roles.every((r: unknown) => typeof r === "string" && r.trim())) bad.push("roles must be a list of role names");
    if (!Array.isArray(e?.areas) || !e.areas.length || !e.areas.every((a: unknown) => NATURE_IDS.has(a as string))) bad.push("areas must use the nature-of-work ids");
    if (typeof e?.checked !== "string" || !DATE.test(e.checked) || Number.isNaN(Date.parse(e.checked))) bad.push("checked must be a date like 2026-11-24");
    if (bad.length) { problems.push(`${where}: ${bad.join("; ")}.`); return; }
    seen.add(e.id);
    employers.push({
      id: e.id, name: e.name.trim(), org_type: e.org_type, url: e.url, summary: e.summary.trim(),
      roles: e.roles.map((r: string) => r.trim()).slice(0, 8), areas: e.areas,
      checked: e.checked, hide_after: addDays(e.checked, HIRING_STALE_DAYS),
    });
  });
  return { employers, problems };
}

export const isFresh = (e: Pick<Employer, "checked" | "hide_after">, today: string) => e.checked <= today && today <= e.hide_after;

export function liveEmployers(today: string, raw: unknown = file): Employer[] {
  return checkEmployers(raw).employers.filter(e => isFresh(e, today)).sort((a, b) => a.name.localeCompare(b.name));
}

// The same filters as the job list: search words, organisation type and nature of work.
// Qualification, experience, fresh-grad and skill filters don't apply to a whole organisation.
export function filterEmployers<T extends Pick<Employer, "org_type" | "areas" | "name" | "summary" | "roles">>(list: T[], f: { q?: string; orgType?: string[]; nature?: string[] }): T[] {
  const words = (f.q || "").toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter(e => {
    if (f.orgType?.length && !f.orgType.includes(e.org_type)) return false;
    if (f.nature?.length && !e.areas.some(a => f.nature!.includes(a))) return false;
    const hay = `${e.name} ${e.summary} ${e.roles.join(" ")}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
}
