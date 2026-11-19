// Privacy-friendly visit counting for SG Social Services.
// Sends anonymous counts to /api/track: a visit, which page, that a search happened, which issue filter was used.
// No cookies. No search words, case text, IP addresses or device details are stored.
// Unique visitors: the browser keeps only the date it was last counted, so it isn't counted twice in a day or month.
// People who switch on "Do Not Track" or Global Privacy Control are not counted at all.
(function () {
  var noop = function () {};
  try {
    var optedOut = navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || window.doNotTrack === "1";
    if (optedOut || navigator.webdriver || /^\/admin/.test(location.pathname)) { window.sgssTrack = noop; return; }

    var queue = [], timer;
    function send() {
      while (queue.length) {
        var body = JSON.stringify({ events: queue.splice(0, 5) });
        var sent = false;
        try { sent = navigator.sendBeacon && navigator.sendBeacon("/api/track", new Blob([body], { type: "text/plain" })); } catch (e) {}
        if (!sent) { try { fetch("/api/track", { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(noop); } catch (e) {} }
      }
    }
    window.sgssTrack = function (metric, key) {
      queue.push({ metric: metric, key: key || "" });
      clearTimeout(timer);
      timer = setTimeout(send, 400);
    };
    addEventListener("pagehide", send);

    // A "visit" is the first page someone opens in a browser session (kept only in that tab, never sent anywhere else).
    var firstPage = false;
    try { if (!sessionStorage.getItem("sgss.visit")) { sessionStorage.setItem("sgss.visit", "1"); firstPage = true; } } catch (e) {}

    var path = location.pathname;
    var page = path === "/" || path === "/index.html" ? "home"
      : path.indexOf("/help/") === 0 ? "help:" + (path.split("/")[2] || "")
      : path.replace(/\.html$/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "home";

    if (firstPage) window.sgssTrack("visit");
    window.sgssTrack("pageview", page);

    // Unique visitors without cookies: the browser remembers only the last day and month it was counted
    // (e.g. {"d":"2026-11-19","m":"2026-11"}). That date stays on the device; just "+1 visitor" is sent.
    try {
      var today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10), month = today.slice(0, 7);
      var seen = null;
      try { seen = JSON.parse(localStorage.getItem("sgss.seen") || "null"); } catch (e) {}
      if (!seen || typeof seen !== "object") { seen = null; window.sgssTrack("visitor_new"); }
      if (!seen || seen.d !== today) window.sgssTrack("visitor_day");
      if (!seen || seen.m !== month) window.sgssTrack("visitor_month");
      localStorage.setItem("sgss.seen", JSON.stringify({ d: today, m: month }));
    } catch (e) {}
  } catch (e) {
    window.sgssTrack = noop;
  }
})();
