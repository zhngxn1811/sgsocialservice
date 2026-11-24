// Turns the assistants' replies into safe HTML: "## " headings, "- " (or "1. ") bullets, **bold** and
// [label](https://link). Everything else is escaped, and only http(s) links become links.
// Used by the jobs board (public/jobs/jobs.js). Same rules as the case assistant on the home page.
(function (root) {
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function inline(s) {
    const tokens = /\*\*(.+?)\*\*|\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;
    let html = "", last = 0;
    for (const match of s.matchAll(tokens)) {
      html += esc(s.slice(last, match.index));
      if (match[1] !== undefined) html += `<strong>${inline(match[1])}</strong>`;
      else {
        let safe = false;
        try { const url = new URL(match[3]); safe = ["https:", "http:"].includes(url.protocol); } catch {}
        html += safe ? `<a href="${esc(match[3])}" target="_blank" rel="noopener noreferrer">${esc(match[2])}</a>` : esc(match[0]);
      }
      last = match.index + match[0].length;
    }
    return html + esc(s.slice(last));
  }
  function md(t) {
    let html = "", inList = false;
    for (const raw of String(t || "").split("\n")) {
      const l = raw.trim();
      if (/^#{1,4}\s/.test(l)) { if (inList) { html += "</ul>"; inList = false; } html += `<h4>${inline(l.replace(/^#+\s*/, ""))}</h4>`; }
      else if (/^([-*]|\d{1,2}[.)])\s/.test(l)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(l.replace(/^([-*]|\d{1,2}[.)])\s/, ""))}</li>`; }
      else if (l) { if (inList) { html += "</ul>"; inList = false; } html += `<p>${inline(l)}</p>`; }
    }
    if (inList) html += "</ul>";
    return html;
  }
  root.SGSSMarkdown = { esc, md };
})(typeof window !== "undefined" ? window : globalThis);
