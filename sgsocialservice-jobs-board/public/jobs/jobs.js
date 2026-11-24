// Jobs board (/jobs/): loads open jobs from /api/jobs, filters and sorts them in the browser,
// and runs the AI jobs assistant (/api/jobs-assistant). The conversation stays in this tab only.
(function (root) {
  const RANK = { doctorate: 5, masters: 4, honours: 3, bachelors: 2, diploma: 1, unspecified: 0 };
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Same rules as filterJobs/sortJobs in netlify/lib/jobs.mts (a test keeps them in step).
  function filterJobs(list, f) {
    const words = (f.q || "").toLowerCase().split(/\s+/).filter(Boolean);
    const out = list.filter(j => {
      if (f.qualification && f.qualification.length && !f.qualification.includes(j.qualification)) return false;
      if (typeof f.maxYears === "number" && (j.min_years ?? 0) > f.maxYears) return false;
      if (f.fresh && !j.fresh_grad) return false;
      if (f.nature && f.nature.length && !f.nature.some(n => j.nature.includes(n))) return false;
      if (f.orgType && f.orgType.length && !f.orgType.includes(j.org_type)) return false;
      if (f.skill && !j.skills.some(s => s.toLowerCase() === f.skill.toLowerCase())) return false;
      if (words.length) {
        const hay = `${j.title} ${j.org} ${j.summary} ${j.skills.join(" ")}`.toLowerCase();
        if (!words.every(w => hay.includes(w))) return false;
      }
      return true;
    });
    return sortJobs(out, f.sort);
  }
  function sortJobs(list, sort) {
    const byNew = (a, b) => (b.posted_at || "").localeCompare(a.posted_at || "") || a.title.localeCompare(b.title);
    const cmp = {
      newest: byNew,
      closing: (a, b) => (a.closes_at || "9999").localeCompare(b.closes_at || "9999") || byNew(a, b),
      qualification: (a, b) => RANK[b.qualification] - RANK[a.qualification] || byNew(a, b),
      "qualification-asc": (a, b) => (RANK[a.qualification] || 9) - (RANK[b.qualification] || 9) || byNew(a, b),
      experience: (a, b) => (a.min_years ?? 0) - (b.min_years ?? 0) || byNew(a, b),
    };
    return [...list].sort(cmp[sort] || byNew);
  }

  const daysUntil = (d, today) => Math.round((Date.parse(d) - Date.parse(today)) / 86400000);
  const fmtDate = d => { const dt = new Date(`${d}T00:00:00+08:00`); return isNaN(dt) ? d : dt.toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" }); };
  function expLabel(j) {
    if (j.min_years === null || j.min_years === undefined) return j.fresh_grad ? "Fresh grads welcome" : "Experience not stated";
    return j.min_years === 0 ? "No experience needed" : `${j.min_years}+ year${j.min_years === 1 ? "" : "s"} experience`;
  }
  function salary(j) {
    const f = n => `$${Number(n).toLocaleString("en-SG")}`;
    if (!j.salary_min && !j.salary_max) return "";
    const r = j.salary_min && j.salary_max && j.salary_min !== j.salary_max ? `${f(j.salary_min)}–${f(j.salary_max)}` : f(j.salary_min || j.salary_max);
    return `${r}${j.salary_type ? ` ${j.salary_type.toLowerCase()}` : ""}`;
  }

  // Same rules as filterEmployers in netlify/lib/hiring.mts.
  function filterEmployers(list, f) {
    const words = (f.q || "").toLowerCase().split(/\s+/).filter(Boolean);
    return list.filter(e => {
      if (f.orgType && f.orgType.length && !f.orgType.includes(e.org_type)) return false;
      if (f.nature && f.nature.length && !e.areas.some(a => f.nature.includes(a))) return false;
      const hay = `${e.name} ${e.summary} ${e.roles.join(" ")}`.toLowerCase();
      return words.every(w => hay.includes(w));
    });
  }

  function employerCard(e, labels) {
    const type = (labels.orgTypes.find(o => o.id === e.org_type) || {}).label || "";
    const roles = e.roles.length ? `<p class="roles"><span>Roles include</span> ${esc(e.roles.join(" · "))}</p>` : "";
    return `<article class="hiring-card">
      <p class="eyebrow">Hiring now${type ? ` · ${esc(type)}` : ""}</p>
      <h3>${esc(e.name)}</h3>
      <p>${esc(e.summary)}</p>${roles}
      <div class="actions"><a class="btn primary" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">See openings</a><span class="checked">Checked ${esc(fmtDate(e.checked))}</span></div>
    </article>`;
  }

  function card(j, labels, today) {
    const lab = (list, id) => (list.find(x => x.id === id) || {}).label || id;
    const left = j.closes_at ? daysUntil(j.closes_at, today) : null;
    const closes = j.closes_at ? `<span class="${left !== null && left <= 7 ? "soon" : ""}">Apply by ${esc(fmtDate(j.closes_at))}</span>` : "";
    const pay = salary(j);
    return `<article class="job-card">
      <h3><a href="/jobs/${esc(j.id)}">${esc(j.title)}</a></h3>
      <p class="org">${esc(j.org)} · ${esc(lab(labels.orgTypes, j.org_type))}</p>
      <div class="tags">${j.fresh_grad ? '<span class="tag fresh">Fresh grads welcome</span>' : ""}<span class="tag">${esc(lab(labels.qualifications, j.qualification))}</span>${j.nature.slice(0, 2).map(n => `<span class="tag">${esc(lab(labels.natures, n))}</span>`).join("")}</div>
      <p>${esc(j.summary)}</p>
      <div class="facts"><span>${esc(expLabel(j))}</span>${j.employment_type ? `<span>${esc(j.employment_type)}</span>` : ""}${pay ? `<span>${esc(pay)}</span>` : ""}${closes}</div>
      <div class="actions"><a class="btn" href="/jobs/${esc(j.id)}">View job</a><a class="btn primary" href="${esc(j.apply_url)}" target="_blank" rel="noopener noreferrer">Apply</a></div>
    </article>`;
  }

  root.SGSSJobs = { filterJobs, sortJobs, card, filterEmployers, employerCard, esc };
  if (typeof document === "undefined") return;

  const $ = s => document.querySelector(s);
  let ALL = [], HIRING = [], META = null, TODAY = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

  // ---------- board ----------
  function checks(el, items, name, counts) {
    el.insertAdjacentHTML("beforeend", items.filter(i => i.id !== "unspecified" || counts[i.id]).map(i =>
      `<label class="check"><input type="checkbox" name="${name}" value="${esc(i.id)}"> <span>${esc(i.label)}</span><span class="n">${counts[i.id] || 0}</span></label>`).join(""));
  }
  function state() {
    const vals = n => [...document.querySelectorAll(`input[name="${n}"]:checked`)].map(i => i.value);
    const y = $("#fYears").value;
    return { q: $("#jobQ").value.trim(), qualification: vals("qual"), maxYears: y === "" ? null : Number(y), fresh: $("#fFresh").checked,
      nature: vals("nature"), orgType: vals("org"), skill: $("#fSkill").value, sort: $("#jobSort").value };
  }
  function saveUrl(f) {
    const p = new URLSearchParams();
    if (f.q) p.set("q", f.q);
    f.qualification.forEach(v => p.append("qual", v));
    if (f.maxYears !== null) p.set("years", f.maxYears);
    if (f.fresh) p.set("fresh", "1");
    f.nature.forEach(v => p.append("nature", v));
    f.orgType.forEach(v => p.append("org", v));
    if (f.skill) p.set("skill", f.skill);
    if (f.sort && f.sort !== "newest") p.set("sort", f.sort);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}${location.hash}` : location.pathname + location.hash);
  }
  function loadUrl() {
    const p = new URLSearchParams(location.search);
    $("#jobQ").value = p.get("q") || "";
    const tick = (n, list) => list.forEach(v => { const el = document.querySelector(`input[name="${n}"][value="${CSS.escape(v)}"]`); if (el) el.checked = true; });
    tick("qual", p.getAll("qual")); tick("nature", p.getAll("nature")); tick("org", p.getAll("org"));
    if (p.has("years")) $("#fYears").value = p.get("years");
    $("#fFresh").checked = p.get("fresh") === "1";
    if (p.get("skill")) $("#fSkill").value = p.get("skill");
    if (p.get("sort")) $("#jobSort").value = p.get("sort");
  }
  function render() {
    const f = state();
    saveUrl(f);
    const list = filterJobs(ALL, f);
    const n = f.qualification.length + f.nature.length + f.orgType.length + (f.maxYears !== null) + f.fresh + !!f.skill;
    $("#filterCount").textContent = n ? `${n} on` : "";
    $("#boardMeta").textContent = `${list.length} of ${ALL.length} open job${ALL.length === 1 ? "" : "s"} · refreshed ${fmtDate(TODAY)}`;
    const hiring = filterEmployers(HIRING, f);
    $("#hiringNow").hidden = !hiring.length;
    $("#hiringList").innerHTML = hiring.map(e => employerCard(e, META)).join("");
    if (!list.length) {
      $("#jobList").innerHTML = `<p class="empty">${ALL.length ? "No jobs match these filters. Try removing one, or ask the jobs assistant for similar roles." : "No jobs are on the board right now. Check back tomorrow: the board refreshes every morning."}</p>`;
      return;
    }
    if (f.sort === "qualification" || f.sort === "qualification-asc") {
      let html = "", last = null;
      for (const j of list) {
        if (j.qualification !== last) { last = j.qualification; html += `<h3 class="group-title">${esc((META.qualifications.find(q => q.id === last) || {}).label || last)}</h3>`; }
        html += card(j, META, TODAY);
      }
      $("#jobList").innerHTML = html;
    } else {
      $("#jobList").innerHTML = list.map(j => card(j, META, TODAY)).join("");
    }
  }
  async function loadJobs() {
    try {
      const r = await fetch("/api/jobs");
      if (!r.ok) throw new Error();
      const d = await r.json();
      ALL = d.jobs || []; HIRING = d.hiring || []; META = d.meta; TODAY = d.updated || TODAY;
    } catch {
      $("#boardMeta").textContent = "Jobs couldn't load. Refresh the page to try again.";
      return;
    }
    const count = key => ALL.reduce((m, j) => { [].concat(j[key]).forEach(v => { m[v] = (m[v] || 0) + 1; }); return m; }, {});
    checks($("#fQual"), META.qualifications, "qual", count("qualification"));
    checks($("#fNature"), META.natures.filter(n => count("nature")[n.id] || HIRING.some(e => e.areas.includes(n.id))), "nature", count("nature"));
    checks($("#fOrg"), META.orgTypes, "org", count("org_type"));
    const skills = Object.entries(count("skills")).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40);
    $("#fSkill").insertAdjacentHTML("beforeend", skills.map(([s, n]) => `<option value="${esc(s)}">${esc(s)} (${n})</option>`).join(""));
    $("#jobSort").innerHTML = META.sorts.map(s => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join("");
    loadUrl();
    if (innerWidth < 860 && !location.search) $("#filters").open = false;
    render();
  }
  let t;
  $("#jobQ").addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 150); });
  ["#jobSort", "#fYears", "#fFresh", "#fSkill"].forEach(s => $(s).addEventListener("change", render));
  $("#filters").addEventListener("change", e => { if (e.target.matches("input[type=checkbox]")) render(); });
  $("#clearFilters").addEventListener("click", () => {
    document.querySelectorAll("#filters input[type=checkbox]").forEach(i => { i.checked = false; });
    $("#fYears").value = ""; $("#fSkill").value = ""; $("#jobQ").value = ""; render();
  });
  loadJobs();

  // ---------- jobs assistant ----------
  const md = t => root.SGSSMarkdown.md(t);
  const log = $("#chatLog"), ask = $("#jobAsk"), btn = $("#jobAskBtn");
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
    const bot = addMsg("bot", '<p class="thinking">Looking through today\'s jobs…</p>');
    bot.scrollIntoView({ block: "nearest" });
    log.scrollTop = log.scrollHeight;
    btn.disabled = true; btn.textContent = "Thinking…"; $("#chatStatus").textContent = "Writing…";
    ctl?.abort(); ctl = new AbortController();
    let acc = "";
    try {
      const r = await fetch("/api/jobs-assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: convo }), signal: ctl.signal });
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
      if (btn.textContent === "Thinking…") btn.textContent = convo.length ? "Send reply" : "Find my matches";
      $("#chatStatus").textContent = "";
      ask.placeholder = "Reply to refine your shortlist, e.g. \"only roles that welcome fresh grads\"";
    }
  }
  btn.addEventListener("click", send);
  ask.addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); });
  $("#jobResetBtn").addEventListener("click", () => {
    ctl?.abort(); convo = [];
    log.innerHTML = '<p class="placeholder">Your shortlist will appear here, best matches first, with links to each job and its application page.</p>';
    btn.textContent = "Find my matches"; btn.disabled = false; ask.value = ""; ask.focus();
  });
})(typeof window !== "undefined" ? window : globalThis);
