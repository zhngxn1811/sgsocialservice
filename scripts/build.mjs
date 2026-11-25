// Build step for SG Social Services. Netlify runs this on every deploy (see netlify.toml).
//
// It copies public/ to dist/ and then:
//   1. writes every listing into the home page HTML, so search engines and slow
//      connections see the full directory without waiting for JavaScript
//   2. creates a page per presenting issue at /help/<slug>/, with its own title,
//      description and listings (copy lives in content/categories.json)
//   3. writes sitemap.xml and adds it to robots.txt
//   4. adds the canonical link, share image tags and structured data (JSON-LD)
//
// You never edit dist/ by hand. Edit public/services.json and content/categories.json as before.
//
// The site address comes from Netlify's URL variable (your custom domain once it's set as primary).
// To override it, set SITE_URL. Run locally with: node scripts/build.mjs

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { RULES, SITE_NAME, checkSeo, readStaticMeta, resolveMeta, validateDirectory } from "./seo.mjs";
import { seoPreviewHtml } from "./seo-preview.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const jsonLd = data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
const slugify = s => String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function between(html, start, end, what) {
  const a = html.indexOf(start);
  const b = a === -1 ? -1 : html.indexOf(end, a);
  if (a === -1 || b === -1) throw new Error(`Build: couldn't find the ${what} in public/index.html`);
  return html.slice(a, b + end.length);
}

function replaceMarker(html, name, content) {
  const re = new RegExp(`<!-- build:${name}\\b[^>]*-->`);
  if (!re.test(html)) throw new Error(`Build: marker "build:${name}" is missing from the page template`);
  return html.replace(re, () => content);
}

export function categoryPages(directory, copy) {
  return directory.categories
    .map(c => {
      const extra = copy[c.id] || {};
      const services = directory.services.filter(s => s.cats.includes(c.id));
      const title = (extra.title || "").trim() || `${c.label} services in Singapore`;
      const description = (extra.description || "").trim() || `${c.label}: services and helplines in Singapore for counsellors and social workers making referrals.`;
      return {
        ...c,
        slug: (extra.slug || "").trim() || slugify(c.label),
        title, // the page heading
        description,
        intro: (extra.intro || "").trim() || `Services and helplines in Singapore for ${c.label.toLowerCase()}.`,
        meta: resolveMeta({ ...extra, title, description }), // search and social preview text
        services,
      };
    })
    .filter(c => c.services.length > 0); // no empty pages
}

function browseNav(pages, esc, currentId) {
  return `<nav class="wrap browse" aria-labelledby="browseTitle">
    <h2 id="browseTitle">Browse by presenting issue</h2>
    <ul>${pages.map(p => `<li><a href="/help/${p.slug}/"${p.id === currentId ? ' aria-current="page"' : ""}>${esc(p.label)}</a></li>`).join("")}</ul>
  </nav>`;
}

function shareTags(esc, base, url) {
  return `<link rel="canonical" href="${esc(url)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(base)}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="SG Social Services: referral directory for social services in Singapore">
<meta name="twitter:image" content="${esc(base)}/og-image.png">`;
}

function categoryHtml({ page, pages, base, crisis, footer, render }) {
  const { esc, card } = render;
  const url = `${base}/help/${page.slug}/`;
  const n = page.services.length;
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "SG Social Services", item: `${base}/` },
          { "@type": "ListItem", position: 2, name: page.label, item: url },
        ],
      },
      {
        "@type": "CollectionPage",
        name: page.title,
        description: page.meta.description,
        url,
        inLanguage: "en-SG",
        isPartOf: { "@type": "WebSite", name: "SG Social Services", url: `${base}/` },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: n,
          itemListElement: page.services.map((s, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "Service",
              name: s.name,
              description: s.desc,
              ...(s.web ? { url: s.web } : {}),
              areaServed: { "@type": "Country", name: "Singapore" },
              provider: { "@type": "Organization", name: s.org, ...(s.phone ? { telephone: s.phone } : {}) },
            },
          })),
        },
      },
    ],
  };

  return `<!doctype html>
<html lang="en-SG">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(page.meta.title)}</title>
<meta name="description" content="${esc(page.meta.description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Source+Sans+3:wght@400;600;700&family=IBM+Plex+Mono:wght@500&display=swap">
<link rel="stylesheet" href="/site.css">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="apple-mobile-web-app-title" content="SG Social">
<meta name="theme-color" content="#18262B" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#E6ECEA" media="(prefers-color-scheme: dark)">
<meta property="og:site_name" content="SG Social Services">
<meta property="og:title" content="${esc(page.meta.socialTitle)}">
<meta property="og:description" content="${esc(page.meta.socialDescription)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="en_SG">
<meta name="twitter:card" content="summary_large_image">
${shareTags(esc, base, url)}
${jsonLd(data)}
<link rel="stylesheet" href="/theme.css">
<script src="/theme.js"></script>
<script src="/donations.js" defer></script>
<script src="/track.js" defer></script>
<script src="/profile.js" defer></script>
</head>
<body>
${crisis}

<header class="top">
  <div class="wrap">
    <a class="brand brand-link" href="/">
      <div class="mark" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-4.4-7-10.2A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 7 2.8C19 16.6 12 21 12 21Z" fill="var(--accent-ink)"/></svg>
      </div>
      <div>
        <span class="name">SG Social Services</span>
        <p>Referral directory for Social Services in Singapore</p>
      </div>
    </a>
    <div class="header-actions"><button class="theme-toggle" type="button" aria-pressed="false" aria-label="Dark mode" hidden><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/></svg><span>Dark mode</span></button>
    <a class="btn primary" href="/">Open the case assistant</a></div>
  </div>
</header>

<main>
  <section class="wrap issue-hero" aria-labelledby="pageTitle">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Directory</a> <span aria-hidden="true">›</span> <span aria-current="page">${esc(page.label)}</span></nav>
    <h1 id="pageTitle">${esc(page.title)}</h1>
    <p>${esc(page.intro)}</p>
  </section>

  <section class="wrap" aria-labelledby="listTitle">
    <div class="cta">
      <p><strong>Working with more than one presenting issue?</strong> Describe the de-identified case to the assistant and it suggests which services fit, in what order.</p>
      <a class="btn teal" href="/">Use the case assistant</a>
    </div>
    <div class="dir-head">
      <div>
        <h2 id="listTitle">${n} ${n === 1 ? "service" : "services"}</h2>
        <p class="meta">Contact details last checked Nov 2026. Confirm hours and eligibility before referring.</p>
      </div>
    </div>
    <div class="grid">${page.services.map(card).join("")}</div>
  </section>

  ${browseNav(pages, esc, page.id)}
</main>

${footer}

<script>
// "Report an update" opens the form on the home page, already set to this listing.
document.addEventListener("click", e => {
  const b = e.target.closest("[data-report]");
  if (b) location.href = "/?report=" + encodeURIComponent(b.dataset.report);
});
</script>
</body>
</html>
`;
}

function sitemap(base, pages, date) {
  const urls = [
    { loc: `${base}/`, priority: "1.0" },
    ...pages.map(p => ({ loc: `${base}/help/${p.slug}/`, priority: "0.8" })),
    { loc: `${base}/jobs/`, priority: "0.9" },
    { loc: `${base}/privacy.html`, priority: "0.3" },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc.replace(/&/g, "&amp;")}</loc><lastmod>${date}</lastmod><priority>${u.priority}</priority></url>`).join("\n")}
</urlset>
`;
}

export async function build({ root = ROOT, outDir = path.join(root, "dist"), siteUrl, date } = {}) {
  const base = String(siteUrl || process.env.SITE_URL || process.env.URL || "http://localhost:8888").replace(/\/+$/, "");
  const today = date || new Date().toISOString().slice(0, 10);
  const pub = path.join(root, "public");

  // Load the shared renderer the browser uses, so built cards match live ones exactly.
  await import(pathToFileURL(path.join(pub, "render.js")).href + `?v=${Date.now()}`);
  const render = globalThis.SGSSRender;

  const readJson = async (file, fallback) => {
    if (!existsSync(file)) return fallback;
    try { return JSON.parse(await readFile(file, "utf8")); }
    catch (e) { throw new Error(`Build stopped: ${path.relative(root, file)} isn't valid JSON (${e.message}). The live site is unchanged.`); }
  };
  const directory = await readJson(path.join(pub, "services.json"));
  const problems = validateDirectory(directory);
  if (problems.length) {
    // Stop before deploying, so a broken edit never replaces the working site.
    throw new Error(`Build stopped: public/services.json has ${problems.length} problem(s). The live site is unchanged.\n - ${problems.join("\n - ")}`);
  }
  const copy = await readJson(path.join(root, "content", "categories.json"), {});
  const site = await readJson(path.join(root, "content", "site.json"), {});
  const pages = categoryPages(directory, copy);
  const homeMeta = resolveMeta(site.home);
  const privacyMeta = resolveMeta(site.privacy);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await cp(pub, outDir, { recursive: true });

  // Home page: listings, chips, count, browse links and head tags.
  const source = await readFile(path.join(pub, "index.html"), "utf8");
  const crisis = between(source, '<div class="crisis"', "</div>\n</div>", "crisis strip");
  const footer = between(source, "<footer>", "</footer>", "footer");
  const { esc } = render;
  const total = directory.services.length;
  let home = applyMeta(source, homeMeta, esc);
  home = replaceMarker(home, "head", shareTags(esc, base, `${base}/`) + "\n" + jsonLd({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: `${base}/`,
    description: homeMeta.description,
    inLanguage: "en-SG",
  }));
  home = replaceMarker(home, "count", `${total} of ${total} services`);
  home = replaceMarker(home, "cats", render.chips(directory.categories, directory.services, "all"));
  home = replaceMarker(home, "grid", directory.services.map(render.card).join(""));
  home = replaceMarker(home, "browse", browseNav(pages, esc));
  await writeFile(path.join(outDir, "index.html"), home);

  // One page per presenting issue.
  for (const page of pages) {
    const dir = path.join(outDir, "help", page.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), categoryHtml({ page, pages, base, crisis, footer, render }));
  }

  // Privacy page: its own search and preview text, plus a canonical link.
  if (existsSync(path.join(pub, "privacy.html"))) {
    let privacy = applyMeta(await readFile(path.join(pub, "privacy.html"), "utf8"), privacyMeta, esc);
    const extra = `${shareTags(esc, base, `${base}/privacy.html`)}
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(privacyMeta.socialTitle)}">
<meta property="og:description" content="${esc(privacyMeta.socialDescription)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
`;
    privacy = privacy.replace("</head>", () => extra + "</head>");
    await writeFile(path.join(outDir, "privacy.html"), privacy);
  }

  const sitemapSource = await readFile(path.join(pub, "sitemap.html"), "utf8");
  let sitemapPage = replaceMarker(sitemapSource, "head", `<link rel="canonical" href="${esc(base)}/sitemap">`);
  sitemapPage = replaceMarker(sitemapPage, "browse", browseNav(pages, esc));
  sitemapPage = replaceMarker(sitemapPage, "footer", footer);
  await writeFile(path.join(outDir, "sitemap.html"), sitemapPage);

  // XML sitemap, and point robots.txt at it.
  await writeFile(path.join(outDir, "sitemap.xml"), sitemap(base, pages, today));
  const robots = existsSync(path.join(pub, "robots.txt")) ? await readFile(path.join(pub, "robots.txt"), "utf8") : "User-agent: *\nAllow: /\n";
  await writeFile(path.join(outDir, "robots.txt"), robots.trimEnd() + `\n\nSitemap: ${base}/sitemap.xml\n`);

  // SEO checks, shown in the deploy log and on /admin/seo. Warnings never stop a deploy.
  const seoPages = [
    { name: "Home", path: "/", meta: homeMeta },
    { name: "Jobs Board", path: "/jobs/", meta: readStaticMeta(await readFile(path.join(pub, "jobs", "index.html"), "utf8")) },
    ...pages.map(p => ({ name: p.label, path: `/help/${p.slug}/`, meta: p.meta })),
    { name: "Privacy", path: "/privacy.html", meta: privacyMeta },
  ];
  const issues = checkSeo(seoPages);
  await mkdir(path.join(outDir, "admin"), { recursive: true });
  await writeFile(path.join(outDir, "admin", "seo.html"), seoPreviewHtml({ pages: seoPages, issues, base, rules: RULES, esc, builtAt: today }));
  // For the /admin/stats dashboard: which /help/ address belongs to which presenting issue.
  await writeFile(path.join(outDir, "admin", "issues.json"), JSON.stringify(pages.map(p => ({ id: p.id, label: p.label, slug: p.slug }))));

  return { base, pages: pages.map(p => ({ id: p.id, slug: p.slug, count: p.services.length })), total, issues };
}

// Swaps in a page's title, description and social text, keeping everything else.
function applyMeta(html, meta, esc) {
  const set = (re, tag) => { html = re.test(html) ? html.replace(re, () => tag) : html.replace("</head>", () => tag + "\n</head>"); };
  set(/<title>[\s\S]*?<\/title>/, `<title>${esc(meta.title)}</title>`);
  set(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(meta.description)}">`);
  if (/<meta property="og:title"/.test(html)) set(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(meta.socialTitle)}">`);
  if (/<meta property="og:description"/.test(html)) set(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(meta.socialDescription)}">`);
  return html;
}

// Run directly: node scripts/build.mjs
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const result = await build();
    console.log(`Built ${result.total} listings and ${result.pages.length} presenting-issue pages for ${result.base}`);
    if (result.issues.length) {
      console.warn(`\nSEO: ${result.issues.length} suggestion(s). See ${result.base}/admin/seo after this deploy.`);
      for (const i of result.issues) console.warn(` - ${i.page} (${i.path}) ${i.field}: ${i.message}`);
    } else {
      console.log("SEO: all titles and descriptions pass the checks.");
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
