// SEO rules for SG Social Services, shared by the build, the tests and the /admin/seo preview.
// Change a number here and every check follows.

export const SITE_NAME = "SG Social Services";

export const RULES = {
  titleMax: 60,           // Google cuts longer titles off with "..."
  titleMin: 15,
  descriptionMin: 70,     // shorter ones tell a searcher too little
  descriptionMax: 155,    // Google cuts longer ones off
  socialTitleMax: 70,     // LinkedIn and WhatsApp cut around here
  socialDescriptionMax: 200,
};

const clean = v => (typeof v === "string" ? v.trim() : "");

// The tab/search title: adds " | SG Social Services" only when it still fits.
export function fullTitle(title) {
  const t = clean(title);
  if (!t || t.includes(SITE_NAME)) return t;
  const withName = `${t} | ${SITE_NAME}`;
  return withName.length <= RULES.titleMax ? withName : t;
}

// Fills in the social text from the Google text when it's left empty.
export function resolveMeta(meta = {}) {
  const title = fullTitle(meta.title);
  const description = clean(meta.description);
  return {
    title,
    description,
    socialTitle: clean(meta.social_title) || clean(meta.title),
    socialDescription: clean(meta.social_description) || description,
  };
}

// Returns a list of { page, field, message } for anything that breaks the rules.
// pages: [{ name, path, meta: <resolved meta> }]
export function checkSeo(pages) {
  const issues = [];
  const add = (page, field, message) => issues.push({ page: page.name, path: page.path, field, message });
  for (const page of pages) {
    const m = page.meta;
    if (!m.title) add(page, "title", "Missing title.");
    else if (m.title.length > RULES.titleMax) add(page, "title", `Title is ${m.title.length} characters. Keep it to ${RULES.titleMax} or Google will cut it off.`);
    else if (m.title.length < RULES.titleMin) add(page, "title", `Title is only ${m.title.length} characters. Say what the page is about.`);
    if (!m.description) add(page, "description", "Missing description.");
    else if (m.description.length > RULES.descriptionMax) add(page, "description", `Description is ${m.description.length} characters. Keep it to ${RULES.descriptionMax} or Google will cut it off.`);
    else if (m.description.length < RULES.descriptionMin) add(page, "description", `Description is only ${m.description.length} characters. Aim for ${RULES.descriptionMin} to ${RULES.descriptionMax}.`);
    if (m.socialTitle.length > RULES.socialTitleMax) add(page, "social_title", `Social title is ${m.socialTitle.length} characters. LinkedIn and WhatsApp cut it around ${RULES.socialTitleMax}.`);
    if (m.socialDescription.length > RULES.socialDescriptionMax) add(page, "social_description", `Social description is ${m.socialDescription.length} characters. Keep it under ${RULES.socialDescriptionMax}.`);
  }
  for (const field of ["title", "description"]) {
    const seen = new Map();
    for (const page of pages) {
      const v = page.meta[field].toLowerCase();
      if (!v) continue;
      if (seen.has(v)) add(page, field, `Same ${field} as "${seen.get(v)}". Every page needs its own.`);
      else seen.set(v, page.name);
    }
  }
  return issues;
}

// Catches a broken services.json before it goes live (for example after a CMS edit).
// Returns a list of problems; the build stops if there are any, so the last good version stays up.
export function validateDirectory(d) {
  const problems = [];
  if (!d || !Array.isArray(d.categories) || !Array.isArray(d.services)) return ["services.json must have a categories list and a services list."];
  const catIds = new Set();
  d.categories.forEach((c, i) => {
    if (!c || !clean(c.id) || !clean(c.label)) problems.push(`Category ${i + 1} needs an id and a label.`);
    else if (catIds.has(c.id)) problems.push(`Category id "${c.id}" is used twice.`);
    else catIds.add(c.id);
  });
  const ids = new Set();
  d.services.forEach((s, i) => {
    const where = s && clean(s.name) ? `"${s.name}"` : `Listing ${i + 1}`;
    if (!s || typeof s !== "object") { problems.push(`${where} is not a valid listing.`); return; }
    for (const f of ["id", "name", "org", "desc"]) if (!clean(s[f])) problems.push(`${where} is missing ${f}.`);
    if (clean(s.id)) { if (ids.has(s.id)) problems.push(`Listing id "${s.id}" is used twice.`); ids.add(s.id); }
    if (!Array.isArray(s.cats) || !s.cats.length) problems.push(`${where} needs at least one category.`);
    else s.cats.filter(c => !catIds.has(c)).forEach(c => problems.push(`${where} uses category "${c}", which doesn't exist.`));
    if (s.tags !== undefined && !Array.isArray(s.tags)) problems.push(`${where}: tags must be a list.`);
    for (const url of [s.web, ...(Array.isArray(s.links) ? s.links.map(l => l && l.url) : [])].filter(Boolean)) {
      try { if (!["https:", "http:"].includes(new URL(url).protocol)) throw 0; } catch { problems.push(`${where} has a link that isn't a web address: ${url}`); }
    }
  });
  return problems;
}
