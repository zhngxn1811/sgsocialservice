// The jobs board assistant: a separate assistant from the directory's case assistant.
// It reads the conversation, picks the open jobs most likely to fit, and hands those to the model
// with instructions to act as a seasoned recruitment consultant for this sector.
// Pure functions only, so the rules can be tested without the model or the database.
import { NATURES, QUALIFICATIONS, experienceLabel, labelFor, salaryLabel, type Nature, type OrgType, type PublicJob, type Qualification } from "./jobs.mjs";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export const LIMITS = { messages: 30, perMessage: 8000, total: 40000 };
// Crude guard against obvious identifiers: NRIC/FIN, Singapore phone numbers, emails.
const PII = [/\b[STFGM]\d{7}[A-Z]\b/i, /(?<![\d$])(?:\+65[\s-]?)?[689]\d{3}[\s-]?\d{4}\b/, /[\w.+-]+@[\w-]+\.[\w.]+/];

// Checks the conversation the browser sends. The browser keeps the history; nothing is stored here.
export function validateMessages(input: unknown): { error: string } | { messages: ChatMessage[] } {
  const list = (input as { messages?: unknown })?.messages;
  if (!Array.isArray(list) || !list.length) return { error: "Tell the assistant what kind of job you're looking for." };
  if (list.length > LIMITS.messages) return { error: "This conversation is getting long. Start a new one to keep going." };
  const messages: ChatMessage[] = [];
  let total = 0;
  for (const [i, m] of list.entries()) {
    const role = (m as { role?: unknown })?.role, content = (m as { content?: unknown })?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return { error: "Send the conversation as a list of messages." };
    if (role !== (i % 2 === 0 ? "user" : "assistant")) return { error: "Send the conversation as a list of messages." };
    const text = content.trim();
    if (!text) return { error: "One of the messages is empty." };
    if (text.length > LIMITS.perMessage) return { error: "Keep each message under 8,000 characters. If you're pasting a CV, the education and work sections are enough." };
    total += text.length;
    if (role === "user" && PII.some(r => r.test(text))) return { error: "This looks like it has an NRIC, phone number or email in it. Remove contact and ID details and try again. The assistant only needs your studies, experience and interests." };
    messages.push({ role, content: text });
  }
  if (messages.at(-1)!.role !== "user") return { error: "Send the conversation as a list of messages." };
  if (total > LIMITS.total) return { error: "This conversation is getting long. Start a new one to keep going." };
  if (messages.at(-1)!.content.length < 3) return { error: "Add a bit more about the job you're looking for." };
  return { messages };
}

// ---------- reading what the person has told us ----------

export type Profile = { level?: Qualification; years?: number; fresh: boolean; natures: Nature[]; orgTypes: OrgType[]; words: string[] };

const LEVELS: [Qualification, RegExp][] = [
  ["doctorate", /\b(ph\.?\s?d|psy\.?\s?d|doctorate|doctoral)\b/i],
  ["masters", /\bmaster'?s?\b|\bmasters\b|\bpostgrad(uate)?\b|\bM\.?(SW|Sc|A|Couns|Psych)\b|\bMGC\b/i],
  ["honours", /\bhonou?rs\b|\bhons\b/i],
  ["graduate-diploma", /\bgraduate diploma\b/i],
  ["bachelors", /\bbachelor'?s?\b|\bdegree\b|\bundergrad(uate)?\b|\buniversity\b|\b(NUS|NTU|SMU|SUSS|SIT|SUTD|SIM|JCU)\b/i],
  ["diploma", /\bdiploma\b|\bpoly(technic)?\b|\b(NP|SP|TP|RP|NYP)\b/],
];
const ORG_WORDS: [OrgType, RegExp][] = [
  ["healthcare", /\bhospital|healthcare|health care|clinic|polyclinic|medical\b/i],
  ["government", /\bgovernment|ministry|civil service|public service|statutory board|MSF\b|MOH\b/i],
  ["education", /\bschool|education|university|preschool|kindergarten|student care\b/i],
  ["charity", /\bcharit|non-?profit|\bNGO\b|foundation\b/i],
  ["social-community", /\bFSC\b|family service|community (services|centre)|social service agenc/i],
];
const SYNONYMS: [Nature, RegExp][] = [
  ["counselling", /\bcounsel/i], ["social-work", /\bsocial work/i], ["clinical-psychology", /\bclinical psych/i],
  ["psychology", /\bpsych(ology|ologist)\b/i], ["youth-work", /\byouth|teen|adolescent/i],
  ["special-needs", /\bspecial needs|disabilit|autism|early intervention|SPED\b/i], ["case-management", /\bcase manag|care coordinat/i],
  ["community-programmes", /\bcommunity|programme|outreach|volunteer/i], ["allied-health", /\b(art|music|occupational|speech|play) therap/i],
  ["research-policy", /\bresearch|policy\b/i], ["nursing-care", /\bnurs(e|ing)|eldercare|elderly care|caregiving\b/i],
];
const STOP = new Set("about after again also always am an and any are because been being both but can could did does doing don each from have having here how into just like looking maybe more most much need only other really role roles some such than that the their them then there these they thing this those want what when where which while with work working would year years your jobs job singapore field area kind looking".split(" "));

export function profileFrom(messages: ChatMessage[]): Profile {
  const text = messages.filter(m => m.role === "user").map(m => m.content).join("\n");
  const level = LEVELS.find(([, re]) => re.test(text))?.[0];
  let years: number | undefined;
  const y = text.match(/\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b(?:[^.\n]{0,40}\b(experience|working|worked|in the|as a))?/i);
  if (y && /experience|work|worked|as a|in the|career|industry/i.test(text.slice(Math.max(0, (y.index ?? 0) - 40), (y.index ?? 0) + 80))) years = Number(y[1]);
  const fresh = /\bfresh (grad|graduate)|\bgraduating\b|\bfinal[- ]year\b|\bstudent\b|\bno (work |working )?experience\b|\bintern(ship)?\b|\bpracticum\b|\bnew grad/i.test(text) && (years === undefined || years < 2);
  const natures = [...new Set([...NATURES.filter(n => n.re.test(text)).map(n => n.id), ...SYNONYMS.filter(([, re]) => re.test(text)).map(([n]) => n)])] as Nature[];
  const orgTypes = ORG_WORDS.filter(([, re]) => re.test(text)).map(([o]) => o);
  const words = [...new Set(text.toLowerCase().match(/[a-z][a-z-]{3,}/g) || [])].filter(w => !STOP.has(w)).slice(0, 60);
  return { level, years, fresh, natures, orgTypes, words };
}

const rankOf = (q: Qualification) => QUALIFICATIONS.find(x => x.id === q)!.rank;

export function scoreJob(job: PublicJob, p: Profile, today: string): number {
  let s = 0;
  const shared = job.nature.filter(n => p.natures.includes(n)).length;
  s += shared * 4;
  if (p.natures.length && !shared) s -= 2;
  if (p.level) {
    const need = rankOf(job.qualification), have = rankOf(p.level);
    if (need && need <= have) s += 2;
    if (need > have) s -= 4;
  }
  const yrs = job.min_years ?? 0;
  if (p.fresh) { if (job.fresh_grad || yrs === 0) s += 3; else if (yrs >= 2) s -= 3; }
  if (typeof p.years === "number") s += yrs <= p.years ? 1 : -Math.min(4, (yrs - p.years) * 2);
  if (p.orgTypes.includes(job.org_type)) s += 2;
  const title = job.title.toLowerCase(), rest = `${job.summary} ${job.skills.join(" ")} ${job.org}`.toLowerCase();
  let t = 0, r = 0;
  for (const w of p.words) { if (title.includes(w)) t++; else if (rest.includes(w)) r++; }
  s += Math.min(t, 3) * 2 + Math.min(r, 4);
  if (job.posted_at && daysBetween(job.posted_at, today) <= 14) s += 0.5;
  return s;
}
const daysBetween = (a: string, b: string) => Math.abs((Date.parse(b) - Date.parse(a)) / 86400000);

// The jobs the model sees: the best matches for this conversation, up to `limit`.
export function pickJobs(all: PublicJob[], messages: ChatMessage[], today: string, limit = 40): PublicJob[] {
  const p = profileFrom(messages);
  return all
    .map(j => ({ j, s: scoreJob(j, p, today) }))
    .sort((a, b) => b.s - a.s || (b.j.posted_at || "").localeCompare(a.j.posted_at || ""))
    .slice(0, limit)
    .map(x => x.j);
}

export function jobLine(j: PublicJob, i: number, base: string): string {
  const salary = salaryLabel(j);
  return [
    `[${i + 1}] ${j.title}`, `employer: ${j.org}`, `organisation type: ${labelFor.orgType(j.org_type)}`,
    `qualification: ${labelFor.qualification(j.qualification)}`, `experience: ${experienceLabel(j.min_years, j.fresh_grad)}`,
    `fresh grads welcome: ${j.fresh_grad ? "yes" : "not stated"}`, `nature: ${j.nature.map(labelFor.nature).join(", ") || "not stated"}`,
    `employment: ${j.employment_type || "not stated"}`, ...(salary ? [`salary: ${salary}`] : []), `location: ${j.location}`,
    `posted: ${j.posted_at || "not stated"}`, j.closing_date_estimated
      ? `board listing ends: ${j.closes_at}; employer deadline not stated` : `applications close: ${j.closes_at || "not stated"}`,
    ...(j.skills.length ? [`skills: ${j.skills.slice(0, 8).join(", ")}`] : []),
    `summary: ${j.summary.replace(/\s+/g, " ")}`,
    `job page: ${base}/jobs/${j.id}`, `apply: ${j.apply_url}`,
  ].join(" | ");
}

export function buildSystem(opts: { jobs: PublicJob[]; total: number; base: string; today: string }): string {
  const { jobs, total, base, today } = opts;
  const list = jobs.length
    ? jobs.map((j, i) => jobLine(j, i, base)).join("\n")
    : "(No open jobs are loaded on the board right now.)";
  return `You are the SG Social Services Jobs Assistant: a recruitment consultant with 30 years of experience helping students, fresh graduates and mid-career switchers land jobs in Singapore's social and health services. You have placed people in social work, counselling, psychology, allied health and therapy, case management and care coordination, youth work, disability and early intervention, eldercare, community programmes, research and policy, and support roles, across hospitals, social service agencies, charities, schools and government. You know what hiring managers in this sector look for, and you are honest, practical and encouraging.

How you work:
- Start from what the person wants and what they bring: their qualification and field of study, the kind and length of their experience (internships, practicum placements, volunteering and part-time work count), the people and issues they want to work with, the type of organisation they prefer, work arrangement, languages and location.
- If something essential to a good match is missing, ask up to 3 short, specific questions. If you already have enough for a useful shortlist, give the shortlist first and put the questions at the end. Never interrogate.
- Think like a recruiter. Separate hard requirements (a set qualification level, professional registration, minimum years) from things that can be learned on the job. Say plainly when they don't meet a requirement, and whether it's still worth applying (for example, when something is only "preferred").
- For mid-career switchers, name the transferable experience that matters for each role. If a listing mentions a conversion route such as a Career Conversion Programme, point it out, but don't invent its details.
- For students and fresh graduates, favour roles marked fresh grads welcome or needing little experience, and show how to make the most of placements, projects and volunteering.

Rules:
- Recommend ONLY jobs from the JOBS list below. Never invent jobs, employers, salaries, requirements, closing dates or links. If you're unsure about a detail, tell them to check the job page.
- For each recommended job, start a bullet with its linked name: **[Job title, Employer](job page URL)**. Then cover: why it fits them; anything to check or watch out for (requirements they may not meet, the closing date); and how to stand out in the application. End each with [Apply](apply URL).
- Group jobs under "## " headings, best fit first, for example "## Your strongest matches" then "## Also worth a look" for stretch or adjacent roles. Include every job that is genuinely relevant; don't pad the list with poor fits.
- If nothing on the list fits, say so plainly. Suggest the closest roles, other job titles worth searching for, and what would make them a stronger candidate. Mention that the board is refreshed every day.
- Finish with "## Next steps": two to four concrete actions, such as tailoring the CV to a named listing, the professional registration a listing asks for, interview preparation, or applying before a closing date.
- Do not ask for or repeat personal identifiers such as NRIC, phone numbers, emails or home addresses. If they paste a CV, use only their education and work details.
- Only help with job searching, applications and careers in Singapore's social and health services. For anything else, say this assistant only helps with jobs in this sector.
- If the person mentions distress, a crisis or thoughts of harming themselves, respond with care first and point them to national mindline 1771 or SOS 1767 (both 24 hours), or 995 in an emergency.
- Today is ${today}. Flag jobs closing or leaving the board within 7 days. A board listing end date is not an employer's application deadline.
- There is no word-count limit. Give as much detail as the person needs, and respect any length they ask for.
- Write in Singapore English: warm, direct and free of jargon. Format: "## " headings, "- " bullets, **bold** only for job names, and [label](URL) links using only URLs from the JOBS list.

JOBS (${jobs.length} of ${total} open roles on the board, most relevant to this conversation first):
${list}`;
}

