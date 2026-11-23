// POST /api/jobs-assistant  { messages: [{ role: "user" | "assistant", content }] }
//   -> streamed job recommendations (text/plain), from the jobs open on the board today.
// A separate assistant from the directory's case assistant, with its own daily cap (JOBS_ASSISTANT_DAILY_CAP).
// The conversation lives in the person's browser. Nothing they type is stored or logged here.
import Anthropic from "@anthropic-ai/sdk";
import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { jobs } from "../../db/schema.js";
import { withCors } from "../lib/cors.mjs";
import { buildSystem, pickJobs, validateMessages } from "../lib/jobs-assistant.mjs";
import { isLive, toPublic, type JobRecord, type PublicJob } from "../lib/jobs.mjs";
import { assistantCapReached, countServerUse, jobsAssistantDailyCap, sgDay } from "../lib/usage.mjs";

const MODEL = process.env.JOBS_CLAUDE_MODEL || process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

// Loads today's open jobs. Swappable in tests.
export async function loadOpenJobs(today: string): Promise<PublicJob[]> {
  const rows = await getDb().select().from(jobs).where(eq(jobs.status, "open")) as JobRecord[];
  return rows.filter(j => isLive(j, today)).map(toPublic);
}

export function makeHandler(load: (today: string) => Promise<PublicJob[]> = loadOpenJobs) {
  return withCors(async (req: Request, context: Context) => {
    if (req.method !== "POST") return json(405, { error: "Use POST." });

    let body: unknown;
    try { body = await req.json(); } catch { return json(400, { error: "Send the conversation as JSON." }); }
    const checked = validateMessages(body);
    if ("error" in checked) return json(400, { error: checked.error });

    // Site-wide daily cap for this assistant, so costs can't run away. Resets at midnight SGT.
    if (await assistantCapReached(jobsAssistantDailyCap(), sgDay(), "jobs_assistant")) {
      countServerUse("jobs_assistant_capped", p => context?.waitUntil?.(p));
      return json(429, { error: "The jobs assistant has reached today's limit. It resets at midnight. You can still browse and filter the jobs below." });
    }

    const today = sgDay();
    let open: PublicJob[];
    try { open = await load(today); }
    catch { return json(503, { error: "Jobs couldn't load just now. Try again in a moment." }); }

    // Count this use for the stats dashboard. Only "+1 jobs assistant use today" is stored, never the conversation.
    countServerUse("jobs_assistant", p => context?.waitUntil?.(p));

    const base = (process.env.SITE_URL || process.env.URL || new URL(req.url).origin).replace(/\/$/, "");
    const system = buildSystem({ jobs: pickJobs(open, checked.messages, today), total: open.length, base, today });
    const messages: Anthropic.MessageParam[] = checked.messages.map(m => ({ role: m.role, content: m.content }));

    const anthropic = new Anthropic();
    const enc = new TextEncoder();
    let stream: ReturnType<typeof anthropic.messages.stream> | undefined;
    let cancelled = false;

    const out = new ReadableStream({
      async start(controller) {
        try {
          while (!cancelled) {
            stream = anthropic.messages.stream({
              model: MODEL,
              // A per-request chunk size, not a limit on the answer: a cut-off chunk carries on below.
              max_tokens: 4096,
              system,
              messages,
            });
            for await (const ev of stream) {
              if (cancelled) return;
              if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") controller.enqueue(enc.encode(ev.delta.text));
            }
            const message = await stream.finalMessage();
            if (cancelled || message.stop_reason !== "max_tokens") break;
            messages.push(
              { role: "assistant", content: message.content },
              { role: "user", content: "Continue the previous response exactly where it stopped, including mid-sentence or mid-word. Do not repeat earlier text or add a continuation preamble. Finish when the person's request has been fully answered." },
            );
          }
        } catch {
          if (!cancelled) {
            console.error("jobs assistant generation failed"); // never log the conversation or provider details
            controller.enqueue(enc.encode("\n\n[The assistant couldn't finish. Try again in a moment.]"));
          }
        } finally {
          if (!cancelled) controller.close();
        }
      },
      cancel() {
        cancelled = true;
        stream?.abort();
      },
    });

    return new Response(out, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  });
}

export default makeHandler();

export const config: Config = {
  path: "/api/jobs-assistant",
  // Netlify's built-in rate limiting: 10 requests per IP per minute
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
