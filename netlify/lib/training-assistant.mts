// The training page assistant: a separate assistant from the directory's and the jobs board's.
// It reads the conversation, orders the courses on /training/ by how well they fit, and hands
// them to the model with instructions to act as a seasoned professional development adviser.
// Pure functions only, so the rules can be tested without the model.
import data from "../../public/training/courses.json" with { type: "json" };

export type ChatMessage = { role: "user" | "assistant"; content: string };
type Fee = { label: string; amount: string };
type Grant = { name: string; detail: string };
export type Course = {
  id: string; title: string; provider: string; provider_type: string; summary: string;
  approaches: string[]; professions: string[]; level: string; format: string; duration: string;
  next_run: string; next_date: string | null; funding: string[]; cpd: string; course_code: string;
  url: string; checked: string; fees: Fee[]; fees_note: string; accreditation: string[]; grants: Grant[];
};
type Option = { id: string; label: string };
export type Catalogue = {
  updated: string;
  taxonomy: Record<"approaches" | "professions" | "levels" | "formats" | "providers" | "funding", Option[]>;
  calendars: { name: string; about: string; url: string }[];
  courses: Course[];
};

export const CATALOGUE = data as unknown as Catalogue;

export const LIMITS = { messages: 30, perMessage: 8000, total: 40000 };
// Crude guard against obvious identifiers: NRIC/FIN, Singapore phone numbers, emails.
const PII = [/\b[STFGM]\d{7}[A-Z]\b/i, /(?<![\d$])(?:\+65[\s-]?)?[689]\d{3}[\s-]?\d{4}\b/, /[\w.+-]+@[\w-]+\.[\w.]+/];

// Checks the conversation the browser sends. The browser keeps the history; nothing is stored here.
export function validateMessages(input: unknown): { error: string } | { messages: ChatMessage[] } {
  const list = (input as { messages?: unknown })?.messages;
  if (!Array.isArray(list) || !list.length) return { error: "Tell the assistant what you'd like to learn." };
  if (list.length > LIMITS.messages) return { error: "This conversation is getting long. Start a new one to keep going." };
  const messages: ChatMessage[] = [];
  let total = 0;
  for (const [i, m] of list.entries()) {
    const role = (m as { role?: unknown })?.role, content = (m as { content?: unknown })?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return { error: "Send the conversation as a list of messages." };
    if (role !== (i % 2 === 0 ? "user" : "assistant")) return { error: "Send the conversation as a list of messages." };
    const text = content.trim();
    if (!text) return { error: "One of the messages is empty." };
    if (text.length > LIMITS.perMessage) return { error: "Keep each message under 8,000 characters." };
    total += text.length;
    if (role === "user" && PII.some(r => r.test(text))) return { error: "This looks like it has an NRIC, phone number or email in it. Remove contact and ID details and try again. The assistant only needs your role, experience and what you'd like to learn." };
    messages.push({ role, content: text });
  }
  if (messages.at(-1)!.role !== "user") return { error: "Send the conversation as a list of messages." };
  if (total > LIMITS.total) return { error: "This conversation is getting long. Start a new one to keep going." };
  if (messages.at(-1)!.content.length < 3) return { error: "Add a bit more about what you'd like to learn." };
  return { messages };
}

// ---------- reading what the person has told us ----------

const APPROACH_WORDS: [string, RegExp][] = [
  ["counselling-skills", /\bcounsel|listening|micro-?skills|basic skills|helping conversation/i],
  ["cbt", /\bcbt\b|cognitive|behaviou?ral therap/i],
  ["mi", /\bmotivational|\bMI\b|ambivalen|behaviou?r change/i],
  ["play-therapy", /\bplay|sandplay|child(ren)? counsel/i],
  ["gestalt", /\bgestalt|oaklander/i],
  ["trauma", /\btrauma|ptsd|abuse|critical incident/i],
  ["suicide-crisis", /\bsuicid|crisis|self-?harm|risk assessment|safety plan/i],
  ["mental-health", /\bmental health|mental illness|psychosis|depress|anxiety|ocd|personality disorder|hoarding/i],
  ["case-formulation", /\bformulation|assessment|diagnos/i],
  ["multicultural", /\bmulticultural|cultur|diversity/i],
  ["casework", /\bcasework|case ?work|case manag|care plan/i],
  ["groupwork", /\bgroup ?work|groups?\b|facilitat/i],
  ["community-work", /\bcommunity work|community development|outreach/i],
  ["family", /\bfamil|parent|couple|marital/i],
  ["child-protection", /\bchild protection|safeguard|child abuse|cps\b/i],
  ["grief", /\bgrief|loss|bereave/i],
  ["supervision", /\bsupervis|supervisor/i],
  ["ethics", /\bethic|dilemma/i],
  ["self-care", /\bself-?care|burn ?out|compassion fatigue|wellbeing|well-being/i],
  ["financial-capability", /\bfinancial|money|debt|low-?income|fcab/i],
  ["tech", /\b(ai|artificial intelligence|chatgpt|llm|tech|digital)\b/i],
];
const PROFESSION_WORDS: [string, RegExp][] = [
  ["social-workers", /\bsocial work|\bMSW\b|\bRSW\b|medical social/i],
  ["counsellors", /\bcounsell?or|\bcounsell?ing\b|\bMGC\b|\bSAC\b|registered counsell?or/i],
  ["psychologists", /\bpsycholog|\bSRP\b|\bSPS\b|clinical psych/i],
  ["practitioners", /\bcase ?worker|para-?counsell?or|social service (practitioner|executive)|programme executive|SWA\b|social work associate/i],
  ["healthcare", /\bnurse|hospital|healthcare|allied health|doctor/i],
];
const STOP = new Set("about after again also always am an and any are because been being both but can could did does doing don each from have having here how into just like looking maybe more most much need only other really some such than that the their them then there these they thing this those want what when where which while with would year years your course courses training learn learning singapore field area kind".split(" "));

export type Profile = { approaches: string[]; professions: string[]; level?: "foundation" | "advanced"; online: boolean; cheap: boolean; accreditation: boolean; words: string[] };

export function profileFrom(messages: ChatMessage[]): Profile {
  const text = messages.filter(m => m.role === "user").map(m => m.content).join("\n");
  const approaches = APPROACH_WORDS.filter(([, re]) => re.test(text)).map(([id]) => id);
  const professions = PROFESSION_WORDS.filter(([, re]) => re.test(text)).map(([id]) => id);
  const level = /\b(new to|beginner|basic|foundation|introduct|just start|student|fresh grad|no experience|first year)\b/i.test(text) ? "foundation"
    : /\b(advanced|experienced|senior|\d{1,2}\+? years|deepen|specialis|supervisor)\b/i.test(text) ? "advanced" : undefined;
  const online = /\bonline|zoom|virtual|remote|self-?paced\b/i.test(text);
  const cheap = /\bbudget|cheap|afford|free|subsid|grant|funding|skillsfuture|pcg|cost|fees?\b/i.test(text);
  const accreditation = /\bcpd|accredit|recognis|recogniz|registration|register(ed)?\b|\bsrp\b|\bsac\b|wsq|certif/i.test(text);
  const words = [...new Set(text.toLowerCase().match(/[a-z][a-z-]{3,}/g) || [])].filter(w => !STOP.has(w)).slice(0, 60);
  return { approaches, professions, level, online, cheap, accreditation, words };
}

const LEVEL_RANK: Record<string, number> = { foundation: 0, intermediate: 1, advanced: 2, qualification: 2 };

export function scoreCourse(c: Course, p: Profile, today: string): number {
  let s = 0;
  s += 5 * c.approaches.filter(a => p.approaches.includes(a)).length;
  if (p.professions.length) s += c.professions.some(x => p.professions.includes(x)) ? 2 : -2;
  if (p.level === "foundation") s += LEVEL_RANK[c.level] === 0 ? 2 : LEVEL_RANK[c.level] === 2 ? -2 : 0;
  if (p.level === "advanced") s += LEVEL_RANK[c.level] >= 1 ? 2 : -1;
  if (p.online && (c.format === "online" || c.format === "blended")) s += 2;
  if (p.cheap && c.funding.length) s += 1;
  if (p.accreditation && c.accreditation.length) s += 2;
  if (c.next_date && c.next_date >= today) s += 1;
  const hay = `${c.title} ${c.summary} ${c.provider}`.toLowerCase();
  s += Math.min(3, p.words.filter(w => hay.includes(w)).length * 0.5);
  return s;
}

// All courses go to the model (the list is small); the best fits come first so it reads them first.
export function orderCourses(all: Course[], messages: ChatMessage[], today: string): Course[] {
  const p = profileFrom(messages);
  return all.map((c, i) => ({ c, i, s: scoreCourse(c, p, today) })).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.c);
}

const lab = (list: Option[], id: string) => list.find(o => o.id === id)?.label || id;

export function courseLine(c: Course, i: number, cat: Catalogue = CATALOGUE): string {
  const t = cat.taxonomy;
  const parts = [
    `${i + 1}. ${c.title} | provider: ${c.provider}`,
    `approaches: ${c.approaches.map(a => lab(t.approaches, a)).join(", ")}`,
    `for: ${c.professions.map(p => lab(t.professions, p)).join(", ")}`,
    `level: ${lab(t.levels, c.level)} | format: ${lab(t.formats, c.format)}${c.duration ? ` | duration: ${c.duration}` : ""}`,
    `next run: ${c.next_run}${c.next_date ? ` (starts ${c.next_date})` : ""}`,
    `about: ${c.summary.replace(/\s+/g, " ")}`,
    c.fees.length ? `fees: ${c.fees.map(f => `${f.label} ${f.amount}`).join("; ")}` : "fees: not published",
    ...(c.fees_note ? [`fee note: ${c.fees_note}`] : []),
    ...(c.accreditation.length ? [`accreditation: ${c.accreditation.join("; ")}`] : []),
    ...(c.grants.length ? [`funding and grants: ${c.grants.map(g => `${g.name}: ${g.detail}`).join(" / ")}`] : []),
    ...(c.course_code ? [`course code: ${c.course_code}`] : []),
    `course page: ${c.url}`,
  ];
  return parts.join(" | ");
}

export function buildSystem(opts: { courses: Course[]; today: string; catalogue?: Catalogue }): string {
  const { courses, today, catalogue = CATALOGUE } = opts;
  const list = courses.length ? courses.map((c, i) => courseLine(c, i, catalogue)).join("\n") : "(No courses are loaded right now.)";
  const calendars = catalogue.calendars.map(c => `- ${c.name}: ${c.about} ${c.url}`).join("\n");
  return `You are the training assistant on SG Social Services, a free directory for Singapore's helping professionals.

Act and think like a senior clinical supervisor and professional development adviser with 30 years of experience in Singapore's social and health services. You have trained and supervised social workers, counsellors and psychologists at every stage, from students and new graduates to mid-career switchers and senior practitioners. You know which training is worth the time and money at each stage, how funding and grants work in practice, and what counts towards professional registration and CPD.

Your job: understand what the person wants to learn and why, then recommend the most suitable courses from the COURSES list below, with links, fees, funding and accreditation, and a sensible order to take them in.

How to work:
- If you don't yet know enough, ask up to three short questions: their role or studies and years of practice; what they want to get better at, or the client group they work with; and practical limits like budget, who's paying (self or employer), whether they work at an NCSS member or MSF-funded agency, their age band for funding (under 40, or 40 and above), and whether they need online or in-person learning. If they've already given enough, recommend straight away and ask follow-up questions at the end.
- Recommend ONLY courses from the COURSES list. Never invent courses, providers, dates, fees, grants, accreditation or links. Quote fees and grant conditions exactly as listed. Don't work out a net fee yourself unless the list gives it. If a detail isn't listed, say "check the course page".
- For each recommended course, start a bullet with its linked name: **[Course title, Provider](course page URL)**. Then cover: why it fits them; level and format; next run; fees as listed, and which funding or grants they're likely to qualify for and the conditions; any accreditation or CPD value; and anything to watch out for (entry requirements, past fees, no confirmed date).
- Group courses under "## " headings, for example "## Start here", "## Build on it next" and "## Worth considering later", so the person sees a learning path, not just a list. Include every course that is genuinely relevant; don't pad the list with poor fits.
- Be honest about value. Say when a cheaper or free option covers the same ground, when a course is too advanced or too basic for them, and when supervision or practice hours would help more than another course.
- Help with professional development context where it's useful, such as building towards a recognised qualification, supervision hours, or CPD for renewal. Only state requirements of professional bodies in general terms and tell them to confirm the current rules with the body itself (SAC, SPS, SASW or the Singapore Register of Psychologists).
- If nothing on the list fits, say so plainly, suggest the closest courses, and point them to the TRAINING CALENDARS below, which add new runs all year.
- Finish with "## Next steps": two to four concrete actions, such as registering before a closing date, asking their supervisor about PCG sponsorship, checking a course code on MySkillsFuture, or waiting for a provider's next run.
- Do not ask for or repeat personal identifiers such as NRIC, phone numbers, emails or home addresses.
- Only help with training and professional development for Singapore's social and health services. For anything else, say this assistant only helps with training in this sector.
- If the person mentions distress, a crisis or thoughts of harming themselves, respond with care first and point them to national mindline 1771 or SOS 1767 (both 24 hours), or 995 in an emergency.
- Today is ${today}. A run is upcoming only if its start date is today or later. Flag runs starting within 45 days, and fees marked as from a past run.
- There is no word-count limit. Give as much detail as the person needs, and respect any length they ask for.
- Write in Singapore English: warm, direct and free of jargon. Format: "## " headings, "- " bullets, **bold** only for course names, and [label](URL) links using only URLs from the COURSES and TRAINING CALENDARS lists.

COURSES (${courses.length} courses, most relevant to this conversation first; details checked ${catalogue.updated}):
${list}

TRAINING CALENDARS (providers that add new runs all year):
${calendars}`;
}
