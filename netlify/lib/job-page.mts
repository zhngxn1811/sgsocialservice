// The page for one job: /jobs/<id>. Built on request from the database by netlify/functions/job-page.mts.
// Every piece of job text is escaped. Descriptions are plain text (see htmlToText), never portal HTML.
import { experienceLabel, isVacancy, labelFor, salaryLabel, type JobRecord } from "./jobs.mjs";

export const esc = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const jsonLd = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

// "## " lines become headings, "- " lines become bullets, everything else paragraphs.
export function textToHtml(text: string): string {
  let html = "", inList = false;
  for (const raw of String(text || "").split("\n")) {
    const l = raw.trim();
    if (/^##\s/.test(l)) { if (inList) { html += "</ul>"; inList = false; } html += `<h3>${esc(l.slice(3))}</h3>`; }
    else if (/^- /.test(l)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${esc(l.slice(2))}</li>`; }
    else if (l) { if (inList) { html += "</ul>"; inList = false; } html += `<p>${esc(l)}</p>`; }
  }
  return inList ? html + "</ul>" : html;
}

// MyCareersFuture's employment types in schema.org's words (for Google's job search)
const EMPLOYMENT: [RegExp, string][] = [[/full|permanent/i, "FULL_TIME"], [/part/i, "PART_TIME"], [/contract|freelance/i, "CONTRACTOR"], [/temp/i, "TEMPORARY"], [/intern|attachment|trainee/i, "INTERN"]];
export const employmentTypes = (s: string) => [...new Set(s.split(",").map(t => EMPLOYMENT.find(([re]) => re.test(t))?.[1]).filter((t): t is string => !!t))];

const fmtDate = (d: string | null) => {
  if (!d) return "";
  const dt = new Date(`${d}T00:00:00+08:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" });
};

const HEAD = (title: string, description: string, url: string, extra = "") => `<!doctype html>
<html lang="en-SG">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Source+Sans+3:wght@400;600;700&family=IBM+Plex+Mono:wght@500&display=swap">
<link rel="stylesheet" href="/site.css">
<link rel="stylesheet" href="/jobs/jobs.css">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#18262B" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#E6ECEA" media="(prefers-color-scheme: dark)">
<meta property="og:site_name" content="SG Social Services">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="en_SG">
<link rel="canonical" href="${esc(url)}">
<meta property="og:url" content="${esc(url)}">
${extra}
<link rel="stylesheet" href="/theme.css">
<script src="/theme.js"></script>
<script src="/track.js" defer></script>
</head>
<body>
<header class="top">
  <div class="wrap">
    <a class="brand brand-link" href="/jobs/">
      <div class="mark" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-4.4-7-10.2A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 7 2.8C19 16.6 12 21 12 21Z" fill="var(--accent-ink)"/></svg>
      </div>
      <div>
        <span class="name">SG Social Services Jobs</span>
        <p>Jobs in Singapore's social and health services</p>
      </div>
    </a>
    <div class="header-actions"><button class="theme-toggle" type="button" aria-pressed="false" aria-label="Dark mode" hidden><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/></svg><span>Dark mode</span></button>
    <a class="btn" href="/">Service directory</a></div>
  </div>
</header>
`;

const FOOT = `<footer><div class="wrap">SG Social Services is an independent, volunteer-run directory and jobs board, not affiliated with any employer or job portal. Job details are copied from the source listing. Always check the original before applying. <a href="/privacy.html">Privacy</a> · <a href="/sitemap">Sitemap</a></div></footer>
</body>
</html>`;

export function renderJobPage(job: JobRecord, base: string, today: string): { status: number; html: string } {
  const url = `${base}/jobs/${job.id}`;
  const open = job.status === "open" && (!job.closes_at || job.closes_at >= today);
  const title = `${job.title} at ${job.org} | SG Social Services Jobs`;
  const desc = job.summary || `${job.title} at ${job.org}, Singapore.`;
  const salary = salaryLabel(job);
  const vacancy = isVacancy(job);

  if (!open) {
    return {
      status: 410,
      html: HEAD(title, desc, url, '<meta name="robots" content="noindex">') + `<main class="wrap job-page">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/jobs/">Jobs board</a> <span aria-hidden="true">›</span> <span aria-current="page">${esc(job.title)}</span></nav>
  <h1>${esc(job.title)}</h1>
  <p class="job-org">${esc(job.org)}</p>
  <div class="closed-note">${!vacancy ? "<strong>This opportunity is no longer listed on the board.</strong>" : job.closing_date_estimated ? "<strong>This job is no longer listed on the board.</strong> No employer deadline was recorded." : "<strong>This job is no longer taking applications.</strong> It closed or was taken down by the employer."} <a href="/jobs/">See current jobs</a> or ask the jobs assistant for similar roles.</div>
</main>
` + FOOT,
    };
  }

  const facts: [string, string][] = [
    ["Qualification", labelFor.qualification(job.qualification)],
    ["Experience", experienceLabel(job.min_years, job.fresh_grad)],
    ["Fresh grads", job.fresh_grad ? "Welcome to apply" : "Not stated"],
    ["Nature of work", job.nature.map(labelFor.nature).join(", ") || "Not stated"],
    ["Organisation type", labelFor.orgType(job.org_type)],
    ["Employment", job.employment_type || "Not stated"],
    ...(salary ? [["Salary", salary] as [string, string]] : []),
    ["Location", job.location],
    ...(vacancy ? [
      ["Posted", fmtDate(job.posted_at) || "Not stated"] as [string, string],
      [job.closing_date_estimated ? "Listed until" : "Apply by", fmtDate(job.closes_at) || "Not stated"] as [string, string],
    ] : []),
  ];

  const ld = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: textToHtml(`${job.description}\n${job.requirements ? `## Requirements\n${job.requirements}` : ""}`) || esc(job.summary),
    datePosted: job.posted_at || today,
    ...(job.closes_at && !job.closing_date_estimated ? { validThrough: `${job.closes_at}T23:59:59+08:00` } : {}),
    hiringOrganization: { "@type": "Organization", name: job.org },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "Singapore", addressCountry: "SG" } },
    ...(employmentTypes(job.employment_type).length ? { employmentType: employmentTypes(job.employment_type) } : {}),
    ...(job.salary_min || job.salary_max ? {
      baseSalary: { "@type": "MonetaryAmount", currency: "SGD", value: { "@type": "QuantitativeValue", ...(job.salary_min ? { minValue: job.salary_min } : {}), ...(job.salary_max ? { maxValue: job.salary_max } : {}), unitText: /year|annual/i.test(job.salary_type) ? "YEAR" : /hour/i.test(job.salary_type) ? "HOUR" : "MONTH" } },
    } : {}),
    ...(job.min_years !== null ? { experienceRequirements: { "@type": "OccupationalExperienceRequirements", monthsOfExperience: job.min_years * 12 } } : {}),
    url,
  };

  const emailApplication = job.apply_url.startsWith("mailto:");
  const applyAttrs = emailApplication ? "" : ' target="_blank" rel="noopener noreferrer"';
  const applyLabel = job.application_action === "register" ? "How to register"
    : job.application_action === "check-window" ? "Check application windows"
    : emailApplication ? "Apply by email" : job.source === "submission" ? "Open application page"
    : job.source === "mycareersfuture" ? "Apply on MyCareersFuture" : `Apply${job.source_name ? ` on ${job.source_name}` : ""}`;
  const html = HEAD(title, desc, url, vacancy ? jsonLd(ld) : "") + `<main class="wrap job-page">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/jobs/">Jobs board</a> <span aria-hidden="true">›</span> <span aria-current="page">${esc(job.title)}</span></nav>
  <div class="job-head">
    <div>
      <h1>${esc(job.title)}</h1>
      <p class="job-org">${esc(job.org)}</p>
      <div class="tags">${job.fresh_grad ? '<span class="tag fresh">Fresh grads welcome</span>' : ""}${job.nature.map(n => `<span class="tag">${esc(labelFor.nature(n))}</span>`).join("")}</div>
    </div>
    <div class="apply-box">
      <a class="btn primary apply" href="${esc(job.apply_url)}"${applyAttrs}>${esc(applyLabel)}</a>
      ${job.closes_at ? `<p class="note">${job.closing_date_estimated ? "Listed until" : "Applications close"} ${esc(fmtDate(job.closes_at))}${job.closing_date_estimated ? " (employer deadline not stated)" : ""}</p>` : ""}
    </div>
  </div>
  <div class="job-layout">
    <article class="panel job-body">
      <h2>About the role</h2>
      ${textToHtml(job.description) || `<p>${esc(job.summary || "See the full listing for details.")}</p>`}
      ${job.requirements ? `<h2>Requirements</h2>${textToHtml(job.requirements)}` : ""}
      ${job.skills.length ? `<h2>Skills</h2><div class="tags">${job.skills.map(s => `<span class="tag">${esc(s)}</span>`).join("")}</div>` : ""}
      <p class="apply-foot"><a class="btn primary" href="${esc(job.apply_url)}"${applyAttrs}>${esc(applyLabel)}</a></p>
    </article>
    <aside class="panel job-facts" aria-label="Job details">
      <dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      <p class="note">From ${esc(job.source_name || "the employer")}. Qualification, experience and type of work are read from the listing, so check the original before applying.</p>
      <a class="btn teal" href="/jobs/#assistant">Ask the jobs assistant</a>
    </aside>
  </div>
</main>
` + FOOT;
  return { status: 200, html };
}

export function renderNotFound(base: string, heading = "We couldn't find that job", lead = "It may have closed and been removed. You can"): string {
  return HEAD("Job not found | SG Social Services Jobs", "This job isn't on the board.", `${base}/jobs/`, '<meta name="robots" content="noindex">') + `<main class="wrap job-page">
  <h1>${esc(heading)}</h1>
  <p>${esc(lead)} <a href="/jobs/">see current jobs</a>.</p>
</main>
` + FOOT;
}
