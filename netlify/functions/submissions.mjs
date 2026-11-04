// POST  /api/submissions        recommend a service / report an update (public)
// GET   /api/submissions        list all          (admin: x-admin-key header)
// PATCH /api/submissions/:id    { status }         (admin)
// Stored in Netlify Blobs — no external database needed.
import { getStore } from "@netlify/blobs";

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const clean = (v, n = 1000) => (v ?? "").toString().slice(0, n).trim();
const isAdmin = req => {
  const key = process.env.ADMIN_KEY;
  return !!key && req.headers.get("x-admin-key") === key;
};

export default async (req, context) => {
  const store = getStore({ name: "submissions", consistency: "strong" });
  const id = context.params?.id;

  if (req.method === "POST" && !id) {
    let b = {};
    try { b = await req.json(); } catch { return json(400, { error: "Send the form as JSON." }); }
    if (b.website) return json(201, { ok: true }); // honeypot: bots fill hidden fields
    const kind = b.kind === "update" ? "update" : "recommend";
    const rec = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      created_at: new Date().toISOString(), status: "new", kind,
      name: clean(b.name, 200), org: clean(b.org, 200), category: clean(b.category, 50),
      phone: clean(b.phone, 50), web: clean(b.web, 300), service_id: clean(b.serviceId, 50),
      details: clean(b.details, 2000), role: clean(b.role, 200),
    };
    if (!rec.details) return json(400, { error: "Add some details." });
    if (kind === "recommend" && !rec.name) return json(400, { error: "Add the service name." });
    try { await store.setJSON(rec.id, rec); return json(201, { ok: true }); }
    catch (err) { console.error("submission error:", err?.message || err); return json(500, { error: "Couldn't save that. Try again in a moment." }); }
  }

  if (!isAdmin(req)) return json(401, { error: "Wrong admin key." });

  if (req.method === "GET" && !id) {
    const { blobs } = await store.list();
    const rows = (await Promise.all(blobs.map(b => store.get(b.key, { type: "json" })))).filter(Boolean);
    rows.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return json(200, rows);
  }

  if (req.method === "PATCH" && id) {
    let status = null;
    try { status = (await req.json())?.status; } catch {}
    if (!["new", "done", "rejected"].includes(status)) return json(400, { error: "Status must be new, done or rejected." });
    const rec = await store.get(id, { type: "json" });
    if (!rec) return json(404, { error: "Submission not found." });
    await store.setJSON(id, { ...rec, status });
    return json(200, { ok: true });
  }

  return json(405, { error: "Not supported." });
};

export const config = {
  path: ["/api/submissions", "/api/submissions/:id"],
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
