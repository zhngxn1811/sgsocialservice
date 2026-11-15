// Builds /admin/seo: how every page looks in Google and as a LinkedIn/WhatsApp card,
// with character counts and suggestions. Hidden from search engines (robots.txt + noindex).

export function seoPreviewHtml({ pages, issues, base, rules, esc, builtAt }) {
  const host = base.replace(/^https?:\/\//, "");
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
  const meter = (label, len, min, max) => {
    const state = len === 0 || len > max || (min && len < min) ? "is-bad" : "is-ok";
    const pct = Math.min(100, Math.round((len / max) * 100));
    return `<div class="meter ${state}"><span class="ml">${label}</span><span class="bar"><span style="width:${pct}%"></span></span><span class="mono mn">${len}/${max}</span></div>`;
  };
  const byPath = p => issues.filter(i => i.path === p.path);

  const cards = pages.map(p => {
    const m = p.meta;
    const own = byPath(p);
    const crumbs = p.path === "/" ? host : `${host} › ${p.path.replace(/^\/|\/$/g, "").split("/").join(" › ")}`;
    return `<section class="page" id="p-${esc(p.path.replace(/[^a-z0-9]+/gi, "-"))}">
  <div class="phead">
    <h2>${esc(p.name)}</h2>
    <a class="mono" href="${esc(p.path)}">${esc(p.path)}</a>
    ${own.length ? `<span class="pill warn">${own.length} to fix</span>` : `<span class="pill good">Passes</span>`}
  </div>
  ${own.length ? `<ul class="issues">${own.map(i => `<li>${esc(i.message)}</li>`).join("")}</ul>` : ""}
  <div class="pair">
    <figure>
      <figcaption>Google search result</figcaption>
      <div class="serp">
        <div class="site"><span class="fav" aria-hidden="true"></span><span><span class="sname">SG Social Services</span><span class="crumb">${esc(crumbs)}</span></span></div>
        <div class="stitle">${esc(cut(m.title, rules.titleMax + 1))}</div>
        <div class="sdesc">${esc(cut(m.description, rules.descriptionMax + 1))}</div>
      </div>
      ${meter("Title", m.title.length, rules.titleMin, rules.titleMax)}
      ${meter("Description", m.description.length, rules.descriptionMin, rules.descriptionMax)}
    </figure>
    <figure>
      <figcaption>LinkedIn / WhatsApp preview</figcaption>
      <div class="social">
        <img src="/og-image.png" alt="" width="1200" height="630" loading="lazy">
        <div class="sbody"><div class="stitle2">${esc(cut(m.socialTitle, rules.socialTitleMax + 1))}</div><div class="sdesc2">${esc(cut(m.socialDescription, 110))}</div><div class="shost">${esc(host)}</div></div>
      </div>
      ${meter("Social title", m.socialTitle.length, 0, rules.socialTitleMax)}
      ${meter("Social description", m.socialDescription.length, 0, rules.socialDescriptionMax)}
    </figure>
  </div>
</section>`;
  }).join("\n");

  const total = issues.length;
  return `<!doctype html>
<html lang="en-SG">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>Search previews · SG Social Services</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&family=Source+Sans+3:wght@400;600;700&family=IBM+Plex+Mono:wght@500&display=swap">
<link rel="stylesheet" href="/site.css">
<link rel="stylesheet" href="/theme.css">
<script src="/theme.js"></script>
<style>
/* Google-like colours, in both themes */
:root{--g-link:#1a0dab;--g-text:#4d5156;--g-crumb:#202124;--g-card:#ffffff}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--g-link:#99c3ff;--g-text:#bdc1c6;--g-crumb:#dadce0;--g-card:#1f1f1f}}
:root[data-theme="dark"]{--g-link:#99c3ff;--g-text:#bdc1c6;--g-crumb:#dadce0;--g-card:#1f1f1f}
.seo{max-width:1120px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:28px 48px;display:grid;gap:20px}
.seo h1{font-size:clamp(26px,4vw,34px)}
.lead{color:var(--muted);margin:6px 0 0;max-width:68ch}
.summary{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.pill{display:inline-block;border-radius:999px;padding:3px 10px;font-size:13px;font-weight:700}
.pill.good{background:var(--teal-soft);color:var(--teal)}
.pill.warn{background:var(--warn-soft);color:var(--accent)}
.tips{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 18px;font-size:15px}
.tips ul{margin:6px 0 0;padding-left:20px}
.tips li{margin-bottom:4px}
.page{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px;display:grid;gap:14px;min-width:0}
.phead{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:baseline}
.phead h2{font-size:20px}
.phead a{font-size:13px;color:var(--muted)}
.issues{margin:0;padding:10px 14px 10px 30px;background:var(--warn-soft);border-radius:8px;font-size:14px}
.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}
@media (max-width:820px){.pair{grid-template-columns:1fr}}
figure{margin:0;display:grid;gap:8px;min-width:0;align-content:start}
figcaption{font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--muted)}
.serp{background:var(--g-card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;font-family:Arial,Helvetica,sans-serif;min-width:0}
.site{display:flex;gap:10px;align-items:center;margin-bottom:6px}
.fav{width:26px;height:26px;border-radius:50%;background:#B8322A url("/icons/favicon.svg") center/18px no-repeat;flex:none}
.sname{display:block;font-size:14px;color:var(--g-crumb)}
.crumb{display:block;font-size:12px;color:var(--g-text);overflow-wrap:anywhere}
.stitle{font-size:20px;line-height:1.3;color:var(--g-link);margin-bottom:4px;overflow-wrap:anywhere}
.sdesc{font-size:14px;line-height:1.58;color:var(--g-text);overflow-wrap:anywhere}
.social{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--bg)}
.social img{display:block;width:100%;height:auto;aspect-ratio:1200/630;object-fit:cover}
.sbody{padding:10px 14px 12px;display:grid;gap:3px}
.stitle2{font-weight:700;font-size:16px;line-height:1.3;overflow-wrap:anywhere}
.sdesc2{font-size:14px;color:var(--muted);overflow-wrap:anywhere}
.shost{font-size:12px;color:var(--muted);text-transform:lowercase}
.meter{display:grid;grid-template-columns:minmax(0,9.5em) minmax(0,1fr) auto;gap:10px;align-items:center;font-size:13px}
.ml{color:var(--muted)}
.bar{height:6px;border-radius:999px;background:var(--line);overflow:hidden}
.bar span{display:block;height:100%;background:var(--teal);border-radius:999px}
.meter.is-bad .bar span{background:var(--accent)}
.meter.is-bad .mn{color:var(--accent);font-weight:700}
</style>
</head>
<body>
<main class="seo">
  <header>
    <p class="eyebrow">SG Social Services · private page</p>
    <h1>Search and share previews</h1>
    <p class="lead">How each page appears in Google and when its link is shared on LinkedIn or WhatsApp. Built from the live content on ${esc(builtAt)}. After editing in Pages CMS, wait for Netlify to finish deploying (about a minute), then refresh this page.</p>
  </header>
  <div class="summary">
    ${total ? `<span class="pill warn">${total} suggestion${total === 1 ? "" : "s"}</span>` : `<span class="pill good">All ${pages.length} pages pass</span>`}
    <span class="lead" style="margin:0">Titles up to ${rules.titleMax} characters · descriptions ${rules.descriptionMin} to ${rules.descriptionMax} · every page different</span>
  </div>
  <div class="tips">
    <strong>Good practice</strong>
    <ul>
      <li>Put the main phrase people search for near the start of the title, e.g. "Family violence services in Singapore".</li>
      <li>Write the description for a person deciding whether to click: who it's for and what they'll find.</li>
      <li>Social text can be warmer than search text. Leave it empty to reuse the Google text.</li>
      <li>Google sometimes rewrites descriptions with text from the page. That's normal.</li>
      <li>Changed some text? LinkedIn keeps old previews for a while. Paste the link into LinkedIn Post Inspector to refresh it, and use URL Inspection in Search Console to ask Google to re-read the page.</li>
    </ul>
  </div>
  ${cards}
</main>
</body>
</html>
`;
}
