// Jobs board: shared rules for turning job-portal listings into tidy, filterable records.
// Used by the daily sync (jobs-sync.mts), the jobs API, the job pages and the jobs assistant.
// Everything here is plain functions with no database or network, so it's easy to test.

export const QUALIFICATIONS = [
  { id: "doctorate", label: "Doctorate (PhD/PsyD)", rank: 5 },
  { id: "masters", label: "Master's degree", rank: 4 },
  { id: "honours", label: "Honours degree", rank: 3 },
  { id: "bachelors", label: "Bachelor's degree", rank: 2 },
  { id: "diploma", label: "Diploma", rank: 1 },
  { id: "unspecified", label: "Not stated", rank: 0 },
] as const;
export type Qualification = (typeof QUALIFICATIONS)[number]["id"];

export const ORG_TYPES = [
  { id: "healthcare", label: "Healthcare" },
  { id: "social-community", label: "Social & community services" },
  { id: "government", label: "Government" },
  { id: "education", label: "Education" },
  { id: "charity", label: "Charity & foundations" },
] as const;
export type OrgType = (typeof ORG_TYPES)[number]["id"];

// Nature of work. A job can have more than one. Order matters: the first match is the "main" one.
// Patterns run on the title and the full text; title matches count for more (see natureOf).
export const NATURES = [
  { id: "social-work", label: "Social work", re: /\bsocial work(er|ers)?\b|\bmedical social\b|\bMSW\b/i },
  { id: "counselling", label: "Counselling", re: /\bcounsell?(or|ors|ing)\b|\bcounsel?ling\b/i },
  { id: "clinical-psychology", label: "Clinical psychology", re: /\bclinical psycholog(y|ist|ists)\b/i },
  { id: "psychology", label: "Psychology (other)", re: /\b(educational|counselling|forensic|health|neuro|developmental|organisational|organizational)?\s?psycholog(y|ist|ists|ical)\b/i },
  { id: "case-management", label: "Case management & care coordination", re: /\bcase (manager|management|worker)\b|\bcare (coordinator|coordination|manager)\b|\bcaseworker\b/i },
  { id: "youth-work", label: "Youth work", re: /\byouth (worker|work|officer|development|executive)\b|\bat-risk youth\b/i },
  { id: "allied-health", label: "Allied health & therapy", re: /\b(occupational|speech|art|music|play|drama|physio)\s?therap(y|ist|ists)\b|\bphysiotherap(y|ist)\b|\bdietitian\b|\bspeech (and|&) language\b/i },
  { id: "nursing-care", label: "Nursing & care", re: /\b(staff |enrolled |registered |community |psychiatric )?nurse(s)?\b|\bnursing\b|\bcare (staff|aide|associate|assistant|officer)\b|\bhealthcare assistant\b|\bpatient care\b/i },
  { id: "special-needs", label: "Disability, special needs & early intervention", re: /\bearly intervention\b|\bspecial (needs|education)\b|\bdisabilit(y|ies)\b|\bautism\b|\bEIPIC\b|\bSPED\b/i },
  { id: "community-programmes", label: "Community programmes & outreach", re: /\bcommunity (development|engagement|outreach|partnership|worker|programmes?)\b|\bbefriend(er|ing)\b|\bvolunteer (management|manager|engagement|coordinator)\b|\bprogramme (executive|coordinator|officer|manager)\b|\boutreach\b/i },
  { id: "research-policy", label: "Research, policy & evaluation", re: /\bresearch (officer|assistant|associate|analyst|executive)\b|\bpolicy (officer|analyst|executive|manager)\b|\bevaluation\b|\bdata analyst\b/i },
  { id: "admin-ops", label: "Admin, operations & fundraising", re: /\b(admin(istrative)?|administrator|operations|finance|accounts|hr|human resource|fundraising|donor|corporate communications|marketing) (executive|officer|assistant|manager|associate)\b/i },
] as const;
export type Nature = (typeof NATURES)[number]["id"];

// Skills that matter in this sector, picked out of the job text (portal skill tags are added too).
const SECTOR_SKILLS: [string, RegExp][] = [
  ["Case management", /\bcase management\b/i],
  ["Crisis intervention", /\bcrisis (intervention|management)\b/i],
  ["Risk assessment", /\brisk assessment\b|\bsuicide risk\b/i],
  ["Psychological assessment", /\bpsychological (assessment|testing)\b|\bpsychometric\b/i],
  ["CBT", /\bCBT\b|\bcognitive[- ]behaviou?ral\b/i],
  ["Trauma-informed care", /\btrauma[- ]informed\b/i],
  ["Family therapy", /\bfamily (therapy|work)\b|\bsystemic\b/i],
  ["Group work", /\bgroup ?work\b|\bgroup (programmes|sessions|facilitation)\b/i],
  ["Counselling skills", /\bcounsell?ing skills\b/i],
  ["Report writing", /\breport writing\b|\bcase notes\b|\bcourt reports?\b/i],
  ["Programme development", /\bprogramme (development|planning|design)\b/i],
  ["Volunteer management", /\bvolunteer management\b|\bmanage volunteers\b/i],
  ["Mandarin", /\bmandarin\b|\bchinese dialects?\b/i],
  ["Malay", /\bmalay\b|\bbahasa\b/i],
  ["Tamil", /\btamil\b/i],
];

const LEVEL_RE: [Exclude<Qualification, "unspecified">, RegExp][] = [
  ["doctorate", /\b(ph\.?\s?d|psy\.?\s?d|d\.?\s?clin\.?\s?psy|doctorate|doctoral)\b/i],
  ["masters", /\bmaster'?s?\b|\bmasters?\b|\bpost-?graduate (degree|qualification)\b|\bM\.?\s?(A|Sc|SW|Soc ?Sci|Psych|Couns)\b/i],
  ["honours", /\bhonou?rs\b|\bhons\b/i],
  ["bachelors", /\bbachelor'?s?\b|\b(university |undergraduate |recognised |relevant |a )?degree\b|\bgraduate in\b|\bB\.?\s?(A|Sc|SW|Soc ?Sci)\b/i],
  ["diploma", /\bdiploma\b/i],
];
const PREFERRED = /\b(prefer(red|ably)?|advantage(ous)?|a plus|desirable|bonus|good to have|nice to have|will be considered|is an asset)\b/i;

const rank = (q: Qualification) => QUALIFICATIONS.find(x => x.id === q)!.rank;
const sentences = (text: string) => text.split(/(?<=[.;!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);

// The minimum qualification asked for. "Degree required, Master's preferred" gives "bachelors".
// Sentences that only say a qualification is preferred are used only if nothing is required.
// ssecEqa is MyCareersFuture's education code (SSEC): 5x/6x diploma, 7x/8x degree, 9x master's or doctorate.
export function qualificationOf(text: string, ssecEqa?: string | null): Qualification {
  const required = new Set<Qualification>(), preferred = new Set<Qualification>();
  for (const s of sentences(text)) {
    // "Postgraduate diploma" is above a degree, not a diploma
    const cleaned = s.replace(/\bpost-?graduate diploma\b/gi, "postgraduate qualification")
      // "Master's degree" is a master's requirement, not also a degree (bachelor's) one
      .replace(/\b(master'?s?|masters|doctoral|doctorate|honou?rs|post-?graduate)\s+degree/gi, "$1 qualification");
    for (const [level, re] of LEVEL_RE) if (re.test(cleaned)) (PREFERRED.test(cleaned) ? preferred : required).add(level);
  }
  // "Degree (Honours)" is an honours requirement, not a plain bachelor's one
  if (required.has("honours")) required.delete("bachelors");
  if (preferred.has("honours")) preferred.delete("bachelors");
  const pool = required.size ? required : preferred;
  if (pool.size) return [...pool].sort((a, b) => rank(a) - rank(b))[0];
  const code = String(ssecEqa ?? "").trim();
  if (/^9[2-9]/.test(code)) return "doctorate";
  if (/^9/.test(code)) return "masters";
  if (/^[78]/.test(code)) return "bachelors";
  if (/^[56]/.test(code)) return "diploma";
  return "unspecified";
}

// Minimum years of experience. Uses the portal's own number when it has one.
export function minYearsOf(text: string, portalYears?: number | null): number | null {
  if (typeof portalYears === "number" && Number.isFinite(portalYears) && portalYears >= 0) return Math.min(Math.round(portalYears), 40);
  let best: number | null = null;
  for (const s of sentences(text)) {
    if (!/experience/i.test(s) || PREFERRED.test(s)) continue;
    const m = s.match(/\b(?:at least|minimum(?: of)?|min\.?)?\s*(\d{1,2})\s*(?:\+|or more|-\s*\d{1,2})?\s*(?:years?|yrs?)\b/i);
    if (m) { const n = Number(m[1]); if (n <= 40 && (best === null || n < best)) best = n; }
  }
  return best;
}

const FRESH_YES = /\bfresh (grad|grads|graduates?)\b|\bnew graduates?\b|\bno (prior |previous )?(working |work )?experience (is )?(required|needed|necessary)\b|\bentry[- ]level\b|\bgraduating (students?|in)\b|\bwelcome to apply\b.*\bgraduates?\b/i;
const FRESH_NO = /\bnot suitable for fresh\b|\bfresh graduates? (need not|are not|will not)\b/i;
export function freshGradOf(text: string, minYears: number | null): boolean {
  if (FRESH_NO.test(text)) return false;
  return FRESH_YES.test(text) || minYears === 0;
}

export function natureOf(title: string, text: string): Nature[] {
  const inTitle = NATURES.filter(n => n.re.test(title)).map(n => n.id);
  const inText = NATURES.filter(n => !inTitle.includes(n.id) && (n.re.exec(text)?.length ?? 0) > 0 && countMatches(n.re, text) >= 2).map(n => n.id);
  let out = [...inTitle, ...inText] as Nature[];
  // "Clinical psychologist" shouldn't also show up as "Psychology (other)"
  if (out.includes("clinical-psychology") && !/\b(educational|counselling|forensic|health|neuro|developmental)\s?psycholog/i.test(title + " " + text)) out = out.filter(n => n !== "psychology");
  return out.slice(0, 4);
}
function countMatches(re: RegExp, text: string): number {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return (text.match(g) || []).length;
}

// Type of organisation, from the employer's name and (for MyCareersFuture) its industry code description.
// Edit content/job-org-types.json to fix any organisation the rules get wrong.
export function orgTypeOf(name: string, industry = "", overrides: Record<string, string> = {}, uen = ""): OrgType {
  const o = overrides[uen] || overrides[name.trim().toUpperCase()];
  if (o && ORG_TYPES.some(t => t.id === o)) return o as OrgType;
  const n = ` ${name.toUpperCase()} `, ind = industry.toUpperCase();
  if (/\bMINISTRY OF\b|\bSTATUTORY BOARD\b|\bAGENCY FOR INTEGRATED CARE\b|\bHEALTH PROMOTION BOARD\b|\bNATIONAL COUNCIL OF SOCIAL SERVICE\b|\bAUTHORITY\b|\bPUBLIC SERVICE\b|\bSINGAPORE PRISON SERVICE\b|\bSTATE COURTS\b|\bFAMILY JUSTICE COURTS\b/.test(n) || /PUBLIC ADMINISTRATION|GOVERNMENT/.test(ind)) return "government";
  if (/HOSPITAL|HEALTH|CLINIC|MEDICAL|POLYCLINIC|HOSPICE|NURSING|SINGHEALTH|\bNHG\b|\bNUHS\b|INSTITUTE OF MENTAL HEALTH|DIALYSIS|KIDNEY|CANCER|PSYCHIATR|DENTAL|PHARMAC/.test(n) || /HOSPITAL|MEDICAL|HEALTH|NURSING|CLINIC/.test(ind)) return "healthcare";
  if (/SCHOOL|UNIVERSITY|POLYTECHNIC|INSTITUTE OF TECHNICAL EDUCATION|\bCOLLEGE\b|KINDERGARTEN|PRESCHOOL|PRE-SCHOOL|CHILDCARE|EDUCATION|LEARNING CENTRE/.test(n) || /EDUCATION|SCHOOL|CHILD CARE|PRE-PRIMARY/.test(ind)) return "education";
  if (/FOUNDATION|ASSOCIATION|SOCIETY|MISSION|\bFUND\b|CHARIT|WELFARE|\bTRUST\b|HOME FOR|RED CROSS|SALVATION ARMY|\bYMCA\b|\bYWCA\b/.test(n) || /CHARITABLE|RELIGIOUS|DONATION/.test(ind)) return "charity";
  return "social-community";
}

export function skillsOf(text: string, portalSkills: string[] = []): string[] {
  const out: string[] = [];
  for (const [label, re] of SECTOR_SKILLS) if (re.test(text)) out.push(label);
  for (const s of portalSkills) {
    const t = String(s || "").trim();
    if (t && t.length <= 60 && !out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, 15);
}

// ---------- turning portal HTML into safe text ----------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", hellip: "…" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Job descriptions arrive as HTML from the portal. We never store or show that HTML.
// It becomes plain text with "## " headings and "- " bullets, which the page then escapes and lays out.
export function htmlToText(html: string): string {
  let s = String(html || "");
  s = s.replace(/<(script|style|iframe|object|noscript)[\s\S]*?<\/\1\s*>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<h[1-6][^>]*>/gi, "\n\n## ").replace(/<\/h[1-6]\s*>/gi, "\n\n");
  s = s.replace(/<li[^>]*>/gi, "\n- ").replace(/<\/li\s*>/gi, "");
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|ul|ol|tr|table|section|blockquote)\s*>/gi, "\n\n").replace(/<(p|div|tr|ul|ol)(\s[^>]*)?>/gi, "\n");
  s = s.replace(/<[^>]*>/g, "");
  s = decodeEntities(s).replace(/<[^>]*>/g, ""); // entities could have spelled out a tag
  s = s.replace(/\r/g, "").replace(/[ \t ]+/g, " ");
  const lines = s.split("\n").map(l => l.trim())
    .map(l => l.replace(/^[•·▪◦●○■□➢►\-*]\s*/, "- ").replace(/^##\s*$/, ""))
    .map(l => /^##\s/.test(l) ? `## ${l.slice(3).replace(/[:：]\s*$/, "").trim()}` : l);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^## (.+)\n+(?=## )/gm, "## $1\n\n").trim();
}

// Splits text at the first heading or lead-in line about requirements.
const REQ_HEADING = /^(##\s*)?(job |key |minimum |the )?(requirements?|qualifications?( and experience| & experience)?|what (we are|we're) looking for|what you (will )?need|who (we are looking for|you are)|about you|you (have|should have|will have)|criteria|eligibility|skills (and|&) experience)\b/i;
export function splitRequirements(text: string): { description: string; requirements: string } {
  const lines = text.split("\n");
  const i = lines.findIndex((l, idx) => idx > 0 && l.length < 90 && REQ_HEADING.test(l.replace(/^- /, "")));
  if (i === -1) return { description: text.trim(), requirements: "" };
  const body = lines.slice(i + 1).join("\n").trim();
  return { description: lines.slice(0, i).join("\n").trim(), requirements: body };
}

export function summaryOf(text: string, n = 220): string {
  const plain = text.split("\n").filter(l => !/^##\s/.test(l)).map(l => l.replace(/^- /, "")).join(" ").replace(/\s+/g, " ").trim();
  if (plain.length <= n) return plain;
  const cut = plain.slice(0, n);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), n - 30)).replace(/[,;:.\s]+$/, "") + "…";
}

export const slugify = (s: string) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function jobId(title: string, org: string, sourceId: string): string {
  const head = slugify(title).slice(0, 60).replace(/-+$/, "");
  const who = slugify(org.replace(/\b(pte|ltd|limited|co|company|singapore|the)\b/gi, " ")).slice(0, 30).replace(/-+$/, "");
  const tail = slugify(sourceId).slice(0, 8) || Math.random().toString(36).slice(2, 10);
  return [head || "job", who, tail].filter(Boolean).join("-");
}

export const isHttpsUrl = (u: unknown): u is string => {
  if (typeof u !== "string") return false;
  try { return new URL(u).protocol === "https:"; } catch { return false; }
};

// ---------- MyCareersFuture ----------

// The parts of a MyCareersFuture listing we use (from GET https://api.mycareersfuture.gov.sg/v2/jobs).
export type McfJob = {
  uuid?: string; title?: string; description?: string; minimumYearsExperience?: number | null;
  ssecEqa?: string | null; otherRequirements?: string | null;
  skills?: { skill?: string }[]; categories?: { category?: string }[];
  employmentTypes?: { employmentType?: string }[]; positionLevels?: { position?: string }[];
  status?: { jobStatus?: string }; postedCompany?: { name?: string; uen?: string; ssicDescription2020?: string; ssicDescription?: string } | null;
  hiringCompany?: { name?: string; uen?: string; ssicDescription2020?: string } | null;
  address?: { isOverseas?: boolean; overseasCountry?: string | null; districts?: { location?: string; region?: string }[] } | null;
  metadata?: { jobPostId?: string; newPostingDate?: string; originalPostingDate?: string; expiryDate?: string; jobDetailsUrl?: string; isHideSalary?: boolean; isHideHiringEmployerName?: boolean };
  salary?: { minimum?: number; maximum?: number; type?: { salaryType?: string } } | null;
};

export type JobRecord = {
  id: string; source: "mycareersfuture" | "manual"; source_id: string; source_name: string;
  title: string; org: string; org_uen: string; org_type: OrgType; location: string; employment_type: string;
  salary_min: number | null; salary_max: number | null; salary_type: string;
  summary: string; description: string; requirements: string;
  qualification: Qualification; min_years: number | null; fresh_grad: boolean; nature: Nature[]; skills: string[];
  apply_url: string; source_url: string; posted_at: string | null; closes_at: string | null; status: "open" | "closed";
};

// Is this listing one for the social and health services jobs board?
// Social Services category always counts. Healthcare and other categories count only for sector roles
// (social work, counselling, psychology, therapy, care coordination, youth or disability work).
const SECTOR_TITLE = /\bsocial work|\bcounsell?|\bcounsel?ling|\bpsycholog|\btherap(y|ist)\b|\bcase (manager|management|worker)|\bcare coordinat|\byouth (worker|work|officer)|\bbefriend|\bearly intervention|\bspecial (needs|education)|\bcommunity (development|engagement|outreach|worker)|\bmental (health|wellness|wellbeing)\b|\bwellbeing\b|\bdisabilit|\bautism|\bsocial service|\bfamily service|\bprogramme (executive|coordinator|officer) .*(social|community|youth|senior|elder)|\bpeer support\b|\bcaregiver|\bactive ageing|\beldercare|\bsenior care/i;
export function isRelevantMcf(job: McfJob): boolean {
  if (job.address?.isOverseas || job.address?.overseasCountry) return false; // Singapore roles only
  const cats = (job.categories || []).map(c => String(c.category || ""));
  if (cats.includes("Social Services")) return true;
  return SECTOR_TITLE.test(String(job.title || ""));
}

export function isOpenMcf(job: McfJob, today: string): boolean {
  if (String(job.status?.jobStatus || "").toLowerCase() !== "open") return false;
  const exp = job.metadata?.expiryDate;
  return !exp || exp.slice(0, 10) >= today;
}

export function mapMcfJob(job: McfJob, overrides: Record<string, string> = {}): JobRecord | null {
  const uuid = String(job.uuid || "").trim(), title = String(job.title || "").trim();
  const company = (job.metadata?.isHideHiringEmployerName ? null : job.hiringCompany) || job.postedCompany || {};
  const org = titleCase(String(company.name || "").trim()) || "Employer not named";
  const applyUrl = job.metadata?.jobDetailsUrl || (uuid ? `https://www.mycareersfuture.gov.sg/job/${uuid}` : "");
  if (!uuid || !title || !isHttpsUrl(applyUrl)) return null;

  const text = htmlToText(job.description || "") + (job.otherRequirements ? `\n\n## Other requirements\n\n${htmlToText(job.otherRequirements)}` : "");
  const { description, requirements } = splitRequirements(text);
  const minYears = minYearsOf(text, job.minimumYearsExperience);
  const districts = (job.address?.districts || []).map(d => d.location || "").filter(l => l && l !== "Islandwide");
  const sal = job.metadata?.isHideSalary ? null : job.salary;
  return {
    id: jobId(title, org, uuid),
    source: "mycareersfuture", source_id: uuid, source_name: "MyCareersFuture",
    title, org, org_uen: String(company.uen || ""),
    org_type: orgTypeOf(org, (company as { ssicDescription2020?: string }).ssicDescription2020 || (company as { ssicDescription?: string }).ssicDescription || "", overrides, String(company.uen || "")),
    location: districts.length ? `${districts.slice(0, 3).join(", ")}, Singapore` : "Singapore",
    employment_type: (job.employmentTypes || []).map(e => e.employmentType).filter(Boolean).join(", "),
    salary_min: num(sal?.minimum), salary_max: num(sal?.maximum), salary_type: String(sal?.type?.salaryType || ""),
    summary: summaryOf(description || text), description, requirements,
    qualification: qualificationOf(text, job.ssecEqa), min_years: minYears, fresh_grad: freshGradOf(text, minYears),
    nature: natureOf(title, text), skills: skillsOf(text, (job.skills || []).map(s => String(s.skill || ""))),
    apply_url: applyUrl, source_url: applyUrl,
    posted_at: dateOnly(job.metadata?.newPostingDate || job.metadata?.originalPostingDate),
    closes_at: dateOnly(job.metadata?.expiryDate),
    status: "open",
  };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
const dateOnly = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
// "NEW HOPE COMMUNITY SERVICES LIMITED" -> "New Hope Community Services Limited". Leaves mixed-case names alone.
export function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  const keep = new Set(["NUHS", "NHG", "IMH", "SPD", "AWWA", "MINDS", "SAMH", "TOUCH", "YMCA", "YWCA", "SPS", "MSF", "MOH", "NCSS", "AIC", "HPB", "KK", "KKH", "SGH", "TTSH", "CGH", "SKH", "NTFGH", "NUH", "ITE", "NTUC", "CLG", "FSC", "SSA", "THK", "SACS", "SINDA", "CDAC", "AMKFSC", "PPIS", "MWS", "APSN", "ARC", "CPAS", "SAVH", "DSA", "DAS"]);
  const small = new Set(["OF", "AND", "FOR", "THE", "IN", "AT", "ON"]);
  return s.split(/(\s+|-|\/|\(|\))/).map((w, i) => {
    if (!/[A-Z]/.test(w)) return w;
    if (keep.has(w.replace(/[^A-Z]/g, ""))) return w;
    if (i > 0 && small.has(w)) return w.toLowerCase();
    return w[0] + w.slice(1).toLowerCase();
  }).join("");
}

// ---------- jobs entered by hand (admin) ----------

export type ManualInput = {
  title?: unknown; org?: unknown; apply_url?: unknown; source_url?: unknown; source_name?: unknown; closes_at?: unknown;
  description?: unknown; requirements?: unknown; location?: unknown; employment_type?: unknown;
  qualification?: unknown; min_years?: unknown; fresh_grad?: unknown; org_type?: unknown; nature?: unknown;
  salary_min?: unknown; salary_max?: unknown; salary_type?: unknown; posted_at?: unknown;
};
const str = (v: unknown, n: number) => (typeof v === "string" ? v : "").trim().slice(0, n);

// Checks and tidies a job added on the admin page. Returns an error message or the record.
export function manualJob(input: ManualInput, today: string, overrides: Record<string, string> = {}): { error: string } | { job: JobRecord } {
  const title = str(input.title, 200), org = str(input.org, 200);
  if (!title) return { error: "Add the job title." };
  if (!org) return { error: "Add the organisation." };
  const apply = str(input.apply_url, 500);
  if (!isHttpsUrl(apply)) return { error: "Add the application link (it must start with https://)." };
  const closes = str(input.closes_at, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closes)) return { error: "Add the closing date, so the job comes down when applications close." };
  if (closes < today) return { error: "That closing date has passed. Only add jobs still taking applications." };
  const location = str(input.location, 120) || "Singapore";
  if (!/singapore/i.test(location)) return { error: "Only roles based in Singapore can be listed. Add Singapore to the location." };
  const source = str(input.source_url, 500);
  const description = str(input.description, 20000), requirements = str(input.requirements, 20000);
  const text = `${description}\n\n${requirements}`;
  const q = str(input.qualification, 20) as Qualification;
  const years = input.min_years === "" || input.min_years === null || input.min_years === undefined ? null : Number(input.min_years);
  const minYears = years !== null && Number.isInteger(years) && years >= 0 && years <= 40 ? years : minYearsOf(text);
  const ot = str(input.org_type, 30);
  const nature = Array.isArray(input.nature) ? input.nature.filter((n): n is Nature => NATURES.some(x => x.id === n)).slice(0, 4) : [];
  const id = jobId(title, org, Date.now().toString(36));
  const posted = str(input.posted_at, 10);
  return {
    job: {
      id, source: "manual", source_id: id, source_name: str(input.source_name, 60) || "Employer website",
      title, org, org_uen: "", org_type: ORG_TYPES.some(t => t.id === ot) ? (ot as OrgType) : orgTypeOf(org, "", overrides),
      location, employment_type: str(input.employment_type, 80),
      salary_min: num(Number(input.salary_min)), salary_max: num(Number(input.salary_max)), salary_type: str(input.salary_type, 20),
      summary: summaryOf(description || requirements), description, requirements,
      qualification: QUALIFICATIONS.some(x => x.id === q) ? q : qualificationOf(text),
      min_years: minYears,
      fresh_grad: typeof input.fresh_grad === "boolean" ? input.fresh_grad : freshGradOf(text, minYears),
      nature: nature.length ? nature : natureOf(title, text), skills: skillsOf(text),
      apply_url: apply, source_url: isHttpsUrl(source) ? source : apply,
      posted_at: /^\d{4}-\d{2}-\d{2}$/.test(posted) ? posted : today, closes_at: closes, status: "open",
    },
  };
}

// ---------- filtering and sorting (API, board and assistant all use these) ----------

export type PublicJob = Pick<JobRecord, "id" | "title" | "org" | "org_type" | "location" | "employment_type" | "salary_min" | "salary_max" | "salary_type" | "summary" | "qualification" | "min_years" | "fresh_grad" | "nature" | "skills" | "apply_url" | "source_name" | "posted_at" | "closes_at">;
export const toPublic = (j: JobRecord | PublicJob): PublicJob => ({
  id: j.id, title: j.title, org: j.org, org_type: j.org_type, location: j.location, employment_type: j.employment_type,
  salary_min: j.salary_min, salary_max: j.salary_max, salary_type: j.salary_type, summary: j.summary,
  qualification: j.qualification, min_years: j.min_years, fresh_grad: j.fresh_grad, nature: j.nature, skills: j.skills,
  apply_url: j.apply_url, source_name: j.source_name, posted_at: j.posted_at, closes_at: j.closes_at,
});

export const isLive = (j: { status?: string; closes_at: string | null }, today: string) =>
  (j.status === undefined || j.status === "open") && (!j.closes_at || j.closes_at >= today);

export type JobFilters = {
  q?: string; qualification?: string[]; maxYears?: number | null; fresh?: boolean; internship?: boolean;
  nature?: string[]; orgType?: string[]; skill?: string; sort?: string;
  salaryBracket?: string; seniority?: string;
};

const SALARY_BRACKETS = [
  ["under-3000", 0, 3000], ["3000-3999", 3000, 4000], ["4000-4999", 4000, 5000],
  ["5000-5999", 5000, 6000], ["6000-plus", 6000, Infinity],
] as const;
const PLACEMENT = /\b(?:intern|internship|practicum)\b(?!\s+(?:(?:programme|program|placement)\s+)?(?:coordinator|manager|supervisor)\b)/i;

export function filterJobs<T extends PublicJob>(list: T[], f: JobFilters): T[] {
  const words = (f.q || "").toLowerCase().split(/\s+/).filter(Boolean);
  const bracket = SALARY_BRACKETS.find(([id]) => id === f.salaryBracket);
  const out = list.filter(j => {
    if (bracket) {
      const low = j.salary_min || j.salary_max;
      const high = j.salary_max || j.salary_min;
      if (j.salary_type?.trim().toLowerCase() !== "monthly" || !low || !high || high < bracket[1] || low >= bracket[2]) return false;
    }
    const seniority = j.min_years == null ? "unspecified" : j.min_years < 2 ? "entry" : j.min_years < 5 ? "mid" : "senior";
    if (f.seniority && f.seniority !== seniority) return false;
    if (f.qualification?.length && !f.qualification.includes(j.qualification)) return false;
    if (typeof f.maxYears === "number" && (j.min_years ?? 0) > f.maxYears) return false;
    if ((f.fresh || f.internship) && !(f.fresh && j.fresh_grad) &&
        !(f.internship && (PLACEMENT.test(j.title) || PLACEMENT.test(j.employment_type)))) return false;
    if (f.nature?.length && !f.nature.some(n => (j.nature as string[]).includes(n))) return false;
    if (f.orgType?.length && !f.orgType.includes(j.org_type)) return false;
    if (f.skill && !j.skills.some(s => s.toLowerCase() === f.skill!.toLowerCase())) return false;
    if (words.length) {
      const hay = `${j.title} ${j.org} ${j.summary} ${j.skills.join(" ")}`.toLowerCase();
      if (!words.every(w => hay.includes(w))) return false;
    }
    return true;
  });
  return sortJobs(out, f.sort);
}

export const SORTS = [
  { id: "newest", label: "Newest first" },
  { id: "closing", label: "Closing soon" },
  { id: "qualification", label: "Qualification level (highest first)" },
  { id: "qualification-asc", label: "Qualification level (lowest first)" },
  { id: "experience", label: "Experience required (least first)" },
] as const;

export function sortJobs<T extends PublicJob>(list: T[], sort = "newest"): T[] {
  const byNew = (a: T, b: T) => (b.posted_at || "").localeCompare(a.posted_at || "") || a.title.localeCompare(b.title);
  const cmp: Record<string, (a: T, b: T) => number> = {
    newest: byNew,
    closing: (a, b) => (a.closes_at || "9999").localeCompare(b.closes_at || "9999") || byNew(a, b),
    qualification: (a, b) => rank(b.qualification) - rank(a.qualification) || byNew(a, b),
    "qualification-asc": (a, b) => (rank(a.qualification) || 9) - (rank(b.qualification) || 9) || byNew(a, b),
    experience: (a, b) => (a.min_years ?? 0) - (b.min_years ?? 0) || byNew(a, b),
  };
  return [...list].sort(cmp[sort] || byNew);
}

export const labelFor = {
  qualification: (id: string) => QUALIFICATIONS.find(x => x.id === id)?.label ?? "Not stated",
  orgType: (id: string) => ORG_TYPES.find(x => x.id === id)?.label ?? id,
  nature: (id: string) => NATURES.find(x => x.id === id)?.label ?? id,
};

export function experienceLabel(minYears: number | null, fresh: boolean): string {
  if (minYears === null) return fresh ? "Fresh grads welcome" : "Not stated";
  if (minYears === 0) return "No experience needed";
  return `At least ${minYears} year${minYears === 1 ? "" : "s"}`;
}

export function salaryLabel(j: Pick<JobRecord, "salary_min" | "salary_max" | "salary_type">): string {
  const f = (n: number) => `$${n.toLocaleString("en-SG")}`;
  if (!j.salary_min && !j.salary_max) return "";
  const range = j.salary_min && j.salary_max && j.salary_min !== j.salary_max ? `${f(j.salary_min)} to ${f(j.salary_max)}` : f((j.salary_min || j.salary_max)!);
  return `${range}${j.salary_type ? ` ${j.salary_type.toLowerCase()}` : ""}`;
}
