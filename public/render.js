// Shared listing renderer, used in two places:
//   1. the browser, which filters and searches the directory live (window.SGSSRender)
//   2. the build step (scripts/build.mjs), which writes the same cards into the HTML
//      so search engines and slow connections see every listing straight away.
// Keeping one copy means the built page and the live page can never drift apart.
(function (root) {
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function website(value) {
    const text = String(value ?? "").trim();
    const href = /^(?:https?:)\/\//i.test(text) ? text : `https://${text}`;
    // Only public web protocols are valid for directory website links.
    if (!text || /^[a-z][a-z\d+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) return "";
    try {
      const url = new URL(href);
      return url.hostname.includes(".") && !url.username && !url.password ? href : "";
    } catch { return ""; }
  }

  function anchor(href, label, external = false) {
    return `<a href="${esc(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${esc(label)}</a>`;
  }

  // Link only actual contact values; keep hours, instructions and unsupported modes intact.
  function contactText(value, defaultMode = "") {
    return String(value ?? "").split(/(;|\n)/).map(part => {
      const prefix = part.match(/^(.*?)(?:\+?\d|[A-Z0-9._%+-]+@|https?:\/\/|www\.)/i)?.[1] || "";
      const modes = prefix.match(/\b(?:WhatsApp|SMS|Call|Phone|Tel|Email|Website|Web)\b/gi) || [defaultMode];
      return part.replace(/https?:\/\/[^\s<>]+|www\.[^\s<>]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:[A-Z0-9-]+\.)+[A-Z]{2,}(?:\/[^\s<>]*)?|\+?\d[\d -]*\d|[^]/gi, token => {
        if (/^[A-Z0-9._%+-]+@/i.test(token)) return anchor(`mailto:${token}`, token);
        if (/^(?:https?:\/\/|www\.|(?:[A-Z0-9-]+\.)+[A-Z]{2,})/i.test(token)) {
          const trimmed = token.replace(/[.,;)]+$/, "");
          const href = website(trimmed);
          return (href ? anchor(href, trimmed, true) : esc(trimmed)) + esc(token.slice(trimmed.length));
        }
        if (/^\+?\d/.test(token)) {
          const number = token.trimEnd();
          const digits = number.replace(/\D/g, "");
          if (digits.length < 3) return esc(token);
          const links = modes.map(mode => {
            if (/^whatsapp$/i.test(mode)) {
              const international = digits.length === 8 ? `65${digits}` : digits;
              return anchor(`https://wa.me/${international}`, modes.length > 1 ? `${number} (WhatsApp)` : number, true);
            }
            const protocol = /^sms$/i.test(mode) ? "sms" : /^(call|phone|tel)$/i.test(mode) ? "tel" : "";
            return protocol ? anchor(`${protocol}:${number.startsWith("+") ? "+" : ""}${digits}`, modes.length > 1 ? `${number} (${protocol === "sms" ? "SMS" : "Call"})` : number) : "";
          }).filter(Boolean);
          return (links.length ? links.join(" / ") : esc(number)) + esc(token.slice(number.length));
        }
        return esc(token);
      });
    }).join("");
  }

  function card(s) {
    const tags = (s.h24 ? '<span class="tag h24">24 hours</span>' : "") + (s.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join("");
    const web = website(s.web) ? anchor(website(s.web), s.web.replace(/^https?:\/\//i, ""), true) : esc(s.web || "");
    return `<article class="card${s.cats.includes("crisis") ? " crisis-card" : ""}">
    <h3>${esc(s.name)}</h3><p class="org">${esc(s.org)}</p><p>${esc(s.desc)}</p><div class="tags">${tags}</div>
    <dl class="contact">${s.phone ? `<dt>Call</dt><dd class="mono">${contactText(s.phone, "Call")}</dd>` : ""}${s.other ? `<dt>Also</dt><dd>${contactText(s.other)}</dd>` : ""}<dt>Website</dt><dd>${web}${(s.links || []).map(link => `<br>${website(link.url) ? anchor(website(link.url), link.label, true) : esc(link.label)}`).join("")}</dd></dl>
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
