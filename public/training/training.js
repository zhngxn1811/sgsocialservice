// Training directory: loads /training/courses.json and lets people search and filter it.
// The pure functions (filterCourses, sortCourses, card) run in tests too, so keep them free of DOM access.
(function (root) {
  "use strict";

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const isHttps = u => /^https:\/\/[^\s"'<>]+$/.test(String(u || ""));
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const LEVEL_ORDER = { foundation: 0, intermediate: 1, advanced: 2, qualification: 3 };
  const FILTER_KEYS = ["approach", "profession", "level", "format", "provider", "funding"];

  function daysUntil(day, today) {
    return Math.round((Date.parse(day + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 864e5);
  }
  const isUpcoming = (c, today) => !!c.next_date && c.next_date >= today;
  const isAccredited = c => (c.accreditation || []).length > 0;

  // Lowest amount the provider publishes (after funding where shown). "Free" counts as 0; no published fee sorts last.
  function lowestFee(c) {
    let best = Infinity;
    (c.fees || []).forEach(f => {
      if (/^free$/i.test(String(f.amount).trim())) best = 0;
      (String(f.amount).match(/\$\s?[\d,]+(?:\.\d+)?/g) || []).forEach(m => { const n = parseFloat(m.replace(/[$,\s]/g, "")); if (n < best) best = n; });
    });
    return best;
  }

  // f: { q, upcoming, approach[], profession[], level[], format[], provider[], funding[] }
  function filterCourses(list, f, today) {
    const words = String(f.q || "").toLowerCase().split(/\s+/).filter(Boolean);
    const has = (key, values) => !f[key] || !f[key].length || values.some(v => f[key].includes(v));
    return list.filter(c => {
      if (f.upcoming && !isUpcoming(c, today)) return false;
      if (f.accredited && !isAccredited(c)) return false;
      if (!has("approach", c.approaches) || !has("profession", c.professions) || !has("funding", c.funding)) return false;
      if (!has("level", [c.level]) || !has("format", [c.format]) || !has("provider", [c.provider_type])) return false;
      const hay = `${c.title} ${c.provider} ${c.summary} ${c.course_code} ${(c.approach_labels || []).join(" ")} ${(c.accreditation || []).join(" ")} ${(c.grants || []).map(g => g.name).join(" ")}`.toLowerCase();
      return words.every(w => hay.includes(w));
    });
  }

  function sortCourses(list, sort, today) {
    const byTitle = (a, b) => a.title.localeCompare(b.title);
    const out = list.slice();
    if (sort === "title") return out.sort(byTitle);
    if (sort === "provider") return out.sort((a, b) => a.provider.localeCompare(b.provider) || byTitle(a, b));
    if (sort === "level") return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || byTitle(a, b));
    if (sort === "fee") return out.sort((a, b) => { const fa = lowestFee(a), fb = lowestFee(b); return fa === fb ? byTitle(a, b) : fa < fb ? -1 : 1; });
    // "upcoming": confirmed future runs first (soonest first), then everything else A to Z.
    return out.sort((a, b) => {
      const ua = isUpcoming(a, today), ub = isUpcoming(b, today);
      if (ua !== ub) return ua ? -1 : 1;
      if (ua) return a.next_date.localeCompare(b.next_date) || byTitle(a, b);
      return byTitle(a, b);
    });
  }

  function card(c, tax, today) {
    const lab = (list, id) => (list.find(x => x.id === id) || {}).label || id;
    const soon = isUpcoming(c, today) && daysUntil(c.next_date, today) <= 45;
    const facts = [lab(tax.levels, c.level), lab(tax.formats, c.format), c.duration, c.cpd].filter(Boolean);
    const accred = (c.accreditation || []).length
      ? `<ul class="accred" aria-label="Accreditation">${c.accreditation.map(a => `<li>${esc(a)}</li>`).join("")}</ul>` : "";
    const fees = (c.fees || []).length
      ? `<dl class="fees">${c.fees.map(f => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.amount)}</dd></div>`).join("")}</dl>` : "";
    const feeNote = c.fees_note ? `<p class="fee-note">${esc(c.fees_note)}</p>` : "";
    const grants = (c.grants || []).length
      ? `<details class="grants"><summary>Funding and grants (${c.grants.length})</summary><ul>${c.grants.map(g => `<li><strong>${esc(g.name)}:</strong> ${esc(g.detail)}</li>`).join("")}</ul></details>` : "";
    const link = isHttps(c.url) ? `<a class="btn primary" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">View course</a>` : "";
    return `<article class="job-card course-card" id="c-${esc(c.id)}">
      <h3>${esc(c.title)}</h3>
      <p class="provider">${esc(c.provider)}</p>
      <div class="tags">${c.approaches.slice(0, 3).map(a => `<span class="tag">${esc(lab(tax.approaches, a))}</span>`).join("")}</div>
      <p>${esc(c.summary)}</p>
      ${accred}
      <p class="next${soon ? " soon" : ""}"><strong>Next run:</strong> ${esc(c.next_run)}</p>
      <div class="facts">${facts.map(x => `<span>${esc(x)}</span>`).join("")}<span>For ${esc(c.professions.map(p => lab(tax.professions, p).toLowerCase()).join(", "))}</span></div>
      <div class="money">${fees}${feeNote}${grants}</div>
      <div class="actions">${c.course_code ? `<span class="code">Course code ${esc(c.course_code)}</span>` : "<span></span>"}${link}</div>
    </article>`;
  }

  const fmtDate = d => { const [y, m, day] = d.split("-"); return `${+day} ${MONTHS[+m - 1]} ${y}`; };

  root.SGSSTraining = { filterCourses, sortCourses, card, esc, isUpcoming, lowestFee, FILTER_KEYS };
  if (typeof document === "undefined") return;

  // ---------- page ----------
  const $ = s => document.querySelector(s);
  const TODAY = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  let ALL = [], TAX = null;
  const fieldsets = { approach: "#fApproach", profession: "#fProfession", level: "#fLevel", format: "#fFormat", provider: "#fProvider", funding: "#fFunding" };
  const taxKey = { approach: "approaches", profession: "professions", level: "levels", format: "formats", provider: "providers", funding: "funding" };
  const valuesOf = { approach: c => c.approaches, profession: c => c.professions, level: c => [c.level], format: c => [c.format], provider: c => [c.provider_type], funding: c => c.funding };

  function counts(key) {
    const n = {};
    ALL.forEach(c => valuesOf[key](c).forEach(v => { n[v] = (n[v] || 0) + 1; }));
    return n;
  }

  function buildChecks(key) {
    const n = counts(key);
    const el = $(fieldsets[key]);
    TAX[taxKey[key]].filter(o => n[o.id]).forEach(o => {
      const label = document.createElement("label");
      label.className = "check";
      label.innerHTML = `<input type="checkbox" name="${key}" value="${esc(o.id)}"> <span>${esc(o.label)}</span><span class="n">${n[o.id]}</span>`;
      el.appendChild(label);
    });
  }

  function buildChips() {
    const n = counts("approach");
    const top = TAX.approaches.filter(o => n[o.id]).sort((a, b) => n[b.id] - n[a.id]).slice(0, 10);
    $("#approachChips").innerHTML = top.map(o => `<button type="button" role="listitem" data-approach="${esc(o.id)}" aria-pressed="false">${esc(o.label)}<span class="n">${n[o.id]}</span></button>`).join("");
    $("#approachChips").addEventListener("click", e => {
      const b = e.target.closest("button[data-approach]");
      if (!b) return;
      const box = document.querySelector(`input[name="approach"][value="${b.dataset.approach}"]`);
      if (box) { box.checked = !box.checked; render(); }
    });
  }

  function readFilters() {
    const f = { q: $("#courseQ").value, upcoming: $("#fUpcoming").checked, accredited: $("#fAccredited").checked };
    FILTER_KEYS.forEach(k => { f[k] = Array.from(document.querySelectorAll(`input[name="${k}"]:checked`), i => i.value); });
    return f;
  }

  function writeUrl(f, sort) {
    const p = new URLSearchParams();
    if (f.q) p.set("q", f.q);
    if (f.upcoming) p.set("upcoming", "1");
    if (f.accredited) p.set("accredited", "1");
    FILTER_KEYS.forEach(k => f[k].length && p.set(k, f[k].join(",")));
    if (sort !== "upcoming") p.set("sort", sort);
    const qs = p.toString();
    try { window.history.replaceState(null, "", qs ? `?${qs}` : location.pathname); } catch (e) {}
  }

  function readUrl() {
    const p = new URLSearchParams(location.search);
    $("#courseQ").value = p.get("q") || "";
    $("#fUpcoming").checked = p.get("upcoming") === "1";
    $("#fAccredited").checked = p.get("accredited") === "1";
    if (p.get("sort")) $("#courseSort").value = p.get("sort");
    FILTER_KEYS.forEach(k => (p.get(k) || "").split(",").filter(Boolean).forEach(v => {
      const box = document.querySelector(`input[name="${k}"][value="${CSS.escape(v)}"]`);
      if (box) box.checked = true;
    }));
  }

  function render() {
    const f = readFilters();
    const sort = $("#courseSort").value;
    writeUrl(f, sort);
    const list = sortCourses(filterCourses(ALL, f, TODAY), sort, TODAY);
    const active = FILTER_KEYS.reduce((n, k) => n + f[k].length, 0) + (f.upcoming ? 1 : 0) + (f.accredited ? 1 : 0);
    $("#filterCount").textContent = active ? `(${active} on)` : "";
    document.querySelectorAll("#approachChips button").forEach(b => b.setAttribute("aria-pressed", String(f.approach.includes(b.dataset.approach))));
    const upcoming = list.filter(c => isUpcoming(c, TODAY)).length;
    const priced = list.filter(c => (c.fees || []).length).length;
    $("#boardMeta").textContent = `${list.length} of ${ALL.length} courses · ${upcoming} with a confirmed upcoming run · ${priced} with published fees · checked ${fmtDate(ALL.reduce((d, c) => c.checked > d ? c.checked : d, "0000-00-00"))}`;
    $("#courseList").innerHTML = list.length
      ? list.map(c => card(c, TAX, TODAY)).join("")
      : `<div class="panel empty"><p><strong>No courses match those filters.</strong> Try removing one, or check the training calendars below for new runs.</p></div>`;
  }

  function renderCalendars(cals) {
    $("#calendarList").innerHTML = cals.filter(c => isHttps(c.url)).map(c => `<article class="hiring-card">
      <h3>${esc(c.name)}</h3><p>${esc(c.about)}</p>
      <div class="actions"><a class="btn" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">Open calendar</a></div>
    </article>`).join("");
  }

  async function start() {
    try {
      const r = await fetch("/training/courses.json", { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      TAX = d.taxonomy;
      ALL = d.courses.map(c => ({ ...c, approach_labels: c.approaches.map(a => (TAX.approaches.find(o => o.id === a) || {}).label || a) }));
      FILTER_KEYS.forEach(buildChecks);
      buildChips();
      renderCalendars(d.calendars || []);
      readUrl();
      render();
      document.querySelector("#filters").addEventListener("change", render);
      $("#courseSort").addEventListener("change", render);
      let t; $("#courseQ").addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 150); });
      $("#clearFilters").addEventListener("click", () => {
        document.querySelectorAll("#filters input[type=checkbox]").forEach(i => { i.checked = false; });
        $("#courseQ").value = "";
        render();
      });
      if (window.matchMedia("(max-width: 800px)").matches) $("#filters").open = false;
    } catch (e) {
      $("#boardMeta").textContent = "Courses couldn't load. Please refresh the page.";
    }
  }

  // ---------- training assistant ----------
  // The conversation lives in this tab only. Nothing is stored on the server.
  function startAssistant() {
    const md = t => root.SGSSMarkdown.md(t);
    const log = $("#chatLog"), ask = $("#trainAsk"), btn = $("#trainAskBtn");
    if (!log || !ask || !btn) return;
    const PLACEHOLDER = '<p class="placeholder">Your suggested courses will appear here, in the order to take them, with links, fees and funding.</p>';
    let convo = [], ctl = null;
    const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    function addMsg(cls, html) {
      if (!convo.length && log.querySelector(".placeholder")) log.innerHTML = "";
      const el = document.createElement("div");
      el.className = `msg ${cls}`;
      el.innerHTML = html;
      log.appendChild(el);
      return el;
    }
    async function send() {
      const text = ask.value.trim();
      if (text.length < 3) { ask.focus(); return; }
      if (convo.length >= 29) { addMsg("bot", '<p class="err">This conversation is getting long. Press "Start over" to begin a new one.</p>'); return; }
      const first = !convo.length;
      addMsg("user", esc(text));
      convo.push({ role: "user", content: text });
      ask.value = "";
      const bot = addMsg("bot", '<p class="thinking">Looking through the courses…</p>');
      log.scrollTop = log.scrollHeight;
      btn.disabled = true; btn.textContent = "Thinking…"; $("#chatStatus").textContent = "Writing…";
      ctl?.abort(); ctl = new AbortController();
      let acc = "";
      try {
        const r = await fetch("/api/training-assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: convo }), signal: ctl.signal });
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          bot.innerHTML = `<p class="err">${esc(e.error || "Something went wrong. Try again in a moment.")}</p>`;
          convo.pop(); ask.value = text; return;
        }
        const reader = r.body.getReader(), dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const stick = nearBottom();
          acc += dec.decode(value, { stream: true });
          bot.innerHTML = md(acc);
          if (stick) log.scrollTop = log.scrollHeight; // follow the answer unless the reader has scrolled up
        }
        bot.innerHTML = md(acc);
        convo.push({ role: "assistant", content: acc || "(no reply)" });
        if (first) btn.textContent = "Send reply";
      } catch (err) {
        if (err.name !== "AbortError") {
          bot.innerHTML = (acc ? md(acc) : "") + '<p class="err">The connection dropped. Try again in a moment.</p>';
          if (acc) convo.push({ role: "assistant", content: acc }); else { convo.pop(); ask.value = text; }
        }
      } finally {
        btn.disabled = false;
        if (btn.textContent === "Thinking…") btn.textContent = convo.length ? "Send reply" : "Suggest courses";
        $("#chatStatus").textContent = "";
        ask.placeholder = 'Reply to refine your plan, e.g. "only courses with PCG funding"';
      }
    }
    btn.addEventListener("click", send);
    ask.addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); });
    $("#trainResetBtn").addEventListener("click", () => {
      ctl?.abort(); convo = [];
      log.innerHTML = PLACEHOLDER;
      btn.textContent = "Suggest courses"; btn.disabled = false; ask.value = ""; ask.focus();
    });
  }

  start();
  startAssistant();
})(typeof window !== "undefined" ? window : globalThis);
