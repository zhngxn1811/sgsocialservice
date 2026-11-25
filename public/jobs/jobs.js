// Jobs board (/jobs/): loads open jobs from /api/jobs, filters and sorts them in the browser,
// and runs the AI jobs assistant (/api/jobs-assistant). The conversation stays in this tab only.
(function (root) {
  const PAGE_SIZE = 10;
  const RANK = { doctorate: 5, masters: 4, honours: 3, "graduate-diploma": 2.5, bachelors: 2, diploma: 1, "o-levels": 0.5, unspecified: 0 };
  const SALARY_BRACKETS = [
    ["under-3000", 0, 3000], ["3000-3999", 3000, 4000], ["4000-4999", 4000, 5000],
    ["5000-5999", 5000, 6000], ["6000-plus", 6000, Infinity],
  ];
  const EXPERIENCE_RANGES = [["0-3", 0, 3], ["5-7", 5, 7], ["8-12", 8, 12], ["12-15", 12, 15], ["over-15", 16, Infinity]];
  const INTERNSHIP = /\b(?:interns?|internships?|practicums?)\b(?![\s-]+(?:(?:programme|program|placement)[\s-]+)?(?:coordinator|manager|supervisor)\b)/i;
  const JOB_TYPES = new Map([
    ["full-time", /\bfull[-\s–—]*time\b/i],
    ["part-time", /\bpart[-\s–—]*time\b/i],
    ["locum", /\blocums?\b/i],
    ["contract", /\bcontract\b/i],
    ["freelance", /\bfreelanc(?:e|ers?|ing)\b/i],
  ]);
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Same rules as filterJobs/sortJobs in netlify/lib/jobs.mts (a test keeps them in step).
  function filterJobs(list, f) {
    const words = (f.q || "").toLowerCase().split(/\s+/).filter(Boolean);
    const bracket = SALARY_BRACKETS.find(([id]) => id === f.salaryBracket);
    const experience = EXPERIENCE_RANGES.find(([id]) => id === f.experienceRange);
    const out = list.filter(j => {
      if (bracket) {
        const low = j.salary_min || j.salary_max;
        const high = j.salary_max || j.salary_min;
        if (j.salary_type?.trim().toLowerCase() !== "monthly" || !low || !high || high < bracket[1] || low >= bracket[2]) return false;
      }
      const seniority = j.min_years == null ? "unspecified" : j.min_years < 2 ? "entry" : j.min_years < 5 ? "mid" : "senior";
      if (f.seniority && f.seniority !== seniority) return false;
      if (f.qualification?.length && !f.qualification.includes(j.qualification) &&
          !(j.accepts_graduate_diploma && f.qualification.includes("graduate-diploma"))) return false;
      if (experience && (j.min_years == null || j.min_years < experience[1] || j.min_years > experience[2])) return false;
      if (typeof f.maxYears === "number" && (j.min_years ?? 0) > f.maxYears) return false;
      if ((f.fresh || f.internship) && !(f.fresh && j.fresh_grad) &&
          !(f.internship && (INTERNSHIP.test(j.title) || INTERNSHIP.test(j.employment_type)))) return false;
      if (f.jobType?.length && !f.jobType.some(type => JOB_TYPES.get(type)?.test(j.employment_type) ||
          (type === "locum" && JOB_TYPES.get(type)?.test(j.title)))) return false;
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

  function card(j, labels, today) {
    if (j.programmeCard) return j.programmeCard;
    const lab = (list, id) => (list.find(x => x.id === id) || {}).label || id;
    const left = j.closes_at ? daysUntil(j.closes_at, today) : null;
    const closes = j.closes_at ? `<span class="${left !== null && left <= 7 ? "soon" : ""}">${j.closing_date_estimated ? "Listed until" : "Apply by"} ${esc(fmtDate(j.closes_at))}</span>` : "";
    const pay = salary(j);
    const action = j.application_action === "register" ? "How to register"
      : j.application_action === "check-window" ? "Check application windows" : "Apply";
    const destination = j.external_listing ? esc(j.apply_url) : `/jobs/${esc(j.id)}`;
    const emailApplication = j.apply_url.startsWith("mailto:");
    const external = emailApplication ? "" : ' target="_blank" rel="noopener noreferrer"';
    return `<article class="job-card">
      <h3><a href="${destination}"${j.external_listing ? external : ""}>${esc(j.title)}</a></h3>
      <p class="org">${esc(j.org)} · ${esc(lab(labels.orgTypes, j.org_type))}</p>
      <div class="tags">${j.fresh_grad ? '<span class="tag fresh">Fresh grads welcome</span>' : ""}<span class="tag">${esc(lab(labels.qualifications, j.qualification))}</span>${j.nature.slice(0, 2).map(n => `<span class="tag">${esc(lab(labels.natures, n))}</span>`).join("")}</div>
      ${j.summary ? `<p>${esc(j.summary)}</p>` : ""}
      <div class="facts"><span>${esc(expLabel(j))}</span>${j.employment_type ? `<span>${esc(j.employment_type)}</span>` : ""}${pay ? `<span>${esc(pay)}</span>` : ""}${closes}</div>
      <div class="actions">${j.external_listing ? "" : `<a class="btn" href="${destination}">${action === "Apply" ? "View job" : "View details"}</a>`}<a class="btn primary" href="${esc(j.apply_url)}"${external}>${j.external_listing ? "View original listing" : emailApplication && action === "Apply" ? "Apply by email" : action}</a></div>
    </article>`;
  }

  function programmeListing(article) {
    return {
      title: article.querySelector("h3").textContent,
      org: "",
      summary: article.textContent.replace(/\s+/g, " ").trim(),
      qualification: "unspecified",
      nature: article.dataset.nature?.split(" ") || [],
      org_type: article.dataset.orgType,
      employment_type: article.dataset.employmentType,
      skills: [],
      programmeCard: article.outerHTML,
    };
  }

  function paginateJobs(list, requestedPage) {
    const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const page = Math.max(1, Math.min(requestedPage, pageCount));
    const start = (page - 1) * PAGE_SIZE;
    return { page, pageCount, listings: list.slice(start, start + PAGE_SIZE) };
  }

  root.SGSSJobs = { filterJobs, sortJobs, card, esc, programmeListing, paginateJobs };
  if (typeof document === "undefined") return;

  const $ = s => document.querySelector(s);
  const programmes = [...$("#programmeListings").content.querySelectorAll("article")].map(programmeListing);
  let ALL = programmes, META = null, TODAY = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  let page = 1;

  // ---------- board ----------
  function checks(el, items, name, counts) {
    el.insertAdjacentHTML("beforeend", items.filter(i => i.id !== "unspecified" || counts[i.id]).map(i =>
      `<label class="check"><input type="checkbox" name="${name}" value="${esc(i.id)}"> <span>${esc(i.label)}</span><span class="n">${counts[i.id] || 0}</span></label>`).join(""));
  }
  function state() {
    const vals = n => [...document.querySelectorAll(`input[name="${n}"]:checked`)].map(i => i.value);
    return { q: $("#jobQ").value.trim(), qualification: vals("qual"), experienceRange: $("#fYears").value, fresh: $("#fFresh").checked,
      nature: vals("nature"), orgType: vals("org"), skill: $("#fSkill").value, sort: $("#jobSort").value,
      salaryBracket: $("#fSalary").value, seniority: $("#fSeniority").value,
      internship: $("#fInternship").checked, jobType: vals("jobType") };
  }
  function saveUrl(f) {
    const p = new URLSearchParams();
    if (f.q) p.set("q", f.q);
    f.qualification.forEach(v => p.append("qual", v));
    if (f.experienceRange) p.set("years", f.experienceRange);
    if (f.fresh) p.set("fresh", "1");
    if (f.internship) p.set("internship", "1");
    f.jobType.forEach(v => p.append("jobType", v));
    f.nature.forEach(v => p.append("nature", v));
    f.orgType.forEach(v => p.append("org", v));
    if (f.skill) p.set("skill", f.skill);
    if (f.salaryBracket) p.set("salary", f.salaryBracket);
    if (f.seniority) p.set("seniority", f.seniority);
    if (f.sort && f.sort !== "newest") p.set("sort", f.sort);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}${location.hash}` : location.pathname + location.hash);
  }
  function loadUrl() {
    const p = new URLSearchParams(location.search);
    $("#jobQ").value = p.get("q") || "";
    const tick = (n, list) => list.forEach(v => { const el = document.querySelector(`input[name="${n}"][value="${CSS.escape(v)}"]`); if (el) el.checked = true; });
    tick("qual", p.getAll("qual")); tick("nature", p.getAll("nature")); tick("org", p.getAll("org"));
    tick("jobType", p.getAll("jobType"));
    if (p.has("years")) $("#fYears").value = p.get("years");
    $("#fFresh").checked = p.get("fresh") === "1";
    $("#fInternship").checked = p.get("internship") === "1" || p.get("placement") === "1";
    if (p.get("skill")) $("#fSkill").value = p.get("skill");
    $("#fSalary").value = p.get("salary") || "";
    $("#fSeniority").value = p.get("seniority") || "";
    if (p.get("sort")) $("#jobSort").value = p.get("sort");
  }
  function render() {
    const f = state();
    saveUrl(f);
    const list = filterJobs(ALL, f);
    const { page: currentPage, pageCount, listings } = paginateJobs(list, page);
    page = currentPage;
    $("#jobPages").hidden = pageCount <= 1;
    $("#jobPageStatus").textContent = `Page ${page} of ${pageCount}`;
    $("#prevJobPage").disabled = page === 1;
    $("#nextJobPage").disabled = page === pageCount;
    const n = f.qualification.length + f.nature.length + f.orgType.length + f.jobType.length + !!f.experienceRange + f.fresh + f.internship + !!f.skill + !!f.salaryBracket + !!f.seniority;
    $("#filterCount").textContent = n ? `${n} on` : "";
    $("#boardMeta").textContent = META ? `${list.length} of ${ALL.length} listings · refreshed ${fmtDate(TODAY)}`
      : `Live jobs couldn't load. Showing ${list.length} of ${ALL.length} employer and programme listings.`;
    if (!list.length) {
      $("#jobList").innerHTML = `<p class="empty">${ALL.length ? "No jobs match these filters. Try removing one, or ask the jobs assistant for similar roles." : "No jobs are on the board right now. Check back tomorrow: the board refreshes every morning."}</p>`;
      return;
    }
    if (META && (f.sort === "qualification" || f.sort === "qualification-asc")) {
      let html = "", last = null;
      for (const j of listings) {
        if (j.qualification !== last) { last = j.qualification; html += `<h3 class="group-title">${esc((META.qualifications.find(q => q.id === last) || {}).label || last)}</h3>`; }
        html += card(j, META, TODAY);
      }
      $("#jobList").innerHTML = html;
    } else {
      $("#jobList").innerHTML = listings.map(j => card(j, META, TODAY)).join("");
    }
  }
  async function loadJobs() {
    try {
      const r = await fetch("/api/jobs");
      if (!r.ok) throw new Error();
      const d = await r.json();
      ALL = [...(d.jobs || []), ...programmes]; META = d.meta; TODAY = d.updated || TODAY;
    } catch {
      loadUrl();
      render();
      return;
    }
    const count = key => ALL.reduce((m, j) => { [].concat(j[key]).forEach(v => { m[v] = (m[v] || 0) + 1; }); return m; }, {});
    const qualifications = count("qualification");
    qualifications["graduate-diploma"] = ALL.filter(j => j.qualification === "graduate-diploma" || j.accepts_graduate_diploma).length;
    checks($("#fQual"), META.qualifications, "qual", qualifications);
    const natures = count("nature");
    const orgTypes = count("org_type");
    checks($("#fNature"), META.natures.filter(n => natures[n.id]), "nature", natures);
    checks($("#fOrg"), META.orgTypes, "org", orgTypes);
    const skills = Object.entries(count("skills")).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40);
    $("#fSkill").insertAdjacentHTML("beforeend", skills.map(([s, n]) => `<option value="${esc(s)}">${esc(s)} (${n})</option>`).join(""));
    $("#jobSort").innerHTML = META.sorts.map(s => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join("");
    loadUrl();
    if (innerWidth < 860 && !location.search) $("#filters").open = false;
    render();
  }
  let t;
  function resetPage() {
    clearTimeout(t);
    page = 1;
    render();
  }
  function changePage(offset) {
    page += offset;
    render();
    $("#jobList").focus({ preventScroll: true });
    $("#jobList").scrollIntoView({ block: "start" });
  }
  $("#prevJobPage").addEventListener("click", () => changePage(-1));
  $("#nextJobPage").addEventListener("click", () => changePage(1));
  $("#jobQ").addEventListener("input", () => { clearTimeout(t); t = setTimeout(resetPage, 150); });
  ["#jobSort", "#fYears", "#fSkill", "#fSalary", "#fSeniority"].forEach(s => $(s).addEventListener("change", resetPage));
  $("#filters").addEventListener("change", e => { if (e.target.matches("input[type=checkbox]")) resetPage(); });
  $("#clearFilters").addEventListener("click", () => {
    document.querySelectorAll("#filters input[type=checkbox]").forEach(i => { i.checked = false; });
    ["#fYears", "#fSkill", "#fSalary", "#fSeniority", "#jobQ"].forEach(s => { $(s).value = ""; });
    resetPage();
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
