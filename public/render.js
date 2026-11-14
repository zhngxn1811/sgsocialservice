// Shared listing renderer, used in two places:
//   1. the browser, which filters and searches the directory live (window.SGSSRender)
//   2. the build step (scripts/build.mjs), which writes the same cards into the HTML
//      so search engines and slow connections see every listing straight away.
// Keeping one copy means the built page and the live page can never drift apart.
(function (root) {
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function card(s) {
    const tags = (s.h24 ? '<span class="tag h24">24 hours</span>' : "") + (s.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join("");
    const web = s.web ? `<a href="${esc(s.web)}" target="_blank" rel="noopener">${esc(s.web.replace(/^https?:\/\//, ""))}</a>` : "";
    return `<article class="card${s.cats.includes("crisis") ? " crisis-card" : ""}">
    <h3>${esc(s.name)}</h3><p class="org">${esc(s.org)}</p><p>${esc(s.desc)}</p><div class="tags">${tags}</div>
    <dl class="contact">${s.phone ? `<dt>Call</dt><dd class="mono">${esc(s.phone)}</dd>` : ""}${s.other ? `<dt>Also</dt><dd>${esc(s.other)}</dd>` : ""}<dt>Web</dt><dd>${web}${(s.links || []).map(link => `<br><a href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)}</a>`).join("")}</dd></dl>
    <div class="foot"><span></span><button class="linkbtn" type="button" data-report="${esc(s.id)}">Report an update</button></div></article>`;
  }

  function chips(categories, services, active) {
    const counts = { all: services.length };
    categories.forEach(c => { counts[c.id] = services.filter(s => s.cats.includes(c.id)).length; });
    return [{ id: "all", label: "All" }, ...categories]
      .map(c => `<button class="chip" type="button" data-cat="${esc(c.id)}" aria-pressed="${c.id === active}">${esc(c.label)}<span class="n">${counts[c.id]}</span></button>`)
      .join("");
  }

  root.SGSSRender = { esc, card, chips };
})(typeof window !== "undefined" ? window : globalThis);
