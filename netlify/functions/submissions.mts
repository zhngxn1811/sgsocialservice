// POST  /api/submissions        recommend a service / report an update (public)
// GET   /api/submissions        list all          (admin: x-admin-key header)
// PATCH /api/submissions/:id    { status }         (admin)
// Stored in Netlify Database. Legacy Blobs records are imported when the inbox opens.
import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { submissions } from "../../db/schema.js";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const clean = (v: unknown, n = 1000) => (typeof v === "string" ? v : "").slice(0, n).trim();
const isAdmin = (req: Request) => {
  const key = Netlify.env.get("ADMIN_KEY");
  return !!key && req.headers.get("x-admin-key") === key;
};

export default async (req: Request, context: Context) => {
  const id = context.params?.id;

  if (req.method === "POST" && !id) {
    let b: Record<string, unknown>;
    try { b = await req.json(); } catch { return json(400, { error: "Send the form as JSON." }); }
    if (!b || typeof b !== "object" || Array.isArray(b)) return json(400, { error: "Send the form as JSON." });
    if (b.website) return json(201, { ok: true }); // honeypot: bots fill hidden fields
    if (!["recommend", "update"].includes(String(b.kind))) return json(400, { error: "Choose a submission type." });
    const kind = b.kind as string;
    const rec = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(), status: "new", kind,
      name: clean(b.name, 200), org: clean(b.org, 200), category: clean(b.category, 50),
      phone: clean(b.phone, 50), web: clean(b.web, 300), service_id: clean(b.serviceId, 50),
      details: clean(b.details, 2000), role: clean(b.role, 200),
    };
    if (!rec.details) return json(400, { error: "Add some details." });
    if (kind === "recommend" && !rec.name) return json(400, { error: "Add the service name." });
    if (kind === "update" && !rec.service_id) return json(400, { error: "Choose the listing to update." });
    try { await getDb().insert(submissions).values(rec); return json(201, { ok: true }); }
    catch { return json(500, { error: "Couldn't save that. Try again in a moment." }); }
  }

  if (!isAdmin(req)) return json(401, { error: "Wrong admin key." });

  try {
    const db = getDb();
    if (req.method === "GET" && !id) {
      // Preserve existing submissions without overwriting database review statuses.
      const store = getStore({ name: "submissions", consistency: "strong" });
      for await (const page of store.list({ paginate: true })) {
        for (const blob of page.blobs) {
          const rec = await store.get(blob.key, { type: "json" }) as typeof submissions.$inferInsert | null;
          if (rec) await db.insert(submissions).values({
            id: blob.key, created_at: rec.created_at, status: rec.status,
            kind: rec.kind, name: rec.name, org: rec.org, category: rec.category,
            phone: rec.phone, web: rec.web, service_id: rec.service_id,
            details: rec.details, role: rec.role,
          }).onConflictDoNothing();
        }
      }
      return json(200, await db.select().from(submissions).orderBy(desc(submissions.created_at)));
    }

    if (req.method === "PATCH" && id) {
      let status: unknown = null;
      try { status = (await req.json())?.status; } catch {}
      if (typeof status !== "string" || !["new", "done", "rejected"].includes(status)) return json(400, { error: "Status must be new, done or rejected." });
      const updated = await db.update(submissions).set({ status }).where(eq(submissions.id, id)).returning({ id: submissions.id });
      if (!updated.length) return json(404, { error: "Submission not found." });
      return json(200, { ok: true });
    }
  } catch {
    return json(500, { error: "Couldn't access submissions. Try again in a moment." });
  }

  return json(405, { error: "Not supported." });
};

export const config: Config = {
  path: ["/api/submissions", "/api/submissions/:id"],
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
