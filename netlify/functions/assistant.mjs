// POST /api/assistant  { caseText }  ->  streamed referral suggestions (text/plain)
import Anthropic from "@anthropic-ai/sdk";
import directory from "../../public/services.json" with { type: "json" };

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

// crude guard against obvious identifiers: NRIC/FIN, SG phone numbers, emails
const PII = [/\b[STFGM]\d{7}[A-Z]\b/i, /\b[689]\d{3}\s?\d{4}\b/, /[\w.+-]+@[\w-]+\.[\w.]+/];

const SYSTEM = `You are a referral assistant for counsellors and social workers in Singapore. Using ONLY the directory below, suggest the most relevant services for the de-identified case the user describes.

Rules:
- If there is any risk of suicide, self-harm, harm to others, or immediate danger, start with a "Risk first" section naming 995/999, SOS 1767, mindline 1771, IMH 6389 2222 and NAVH 1800 777 0000, and remind them to follow their agency's risk protocol.
- Group suggestions by presenting issue. For each: name, why it fits this case, and one thing to check before referring (eligibility, language, hours, consent).
- At most 8 services, in priority order.
- If a need isn't covered, list it under "Gaps" with the type of service to look for. Never invent services, phone numbers or links.
- Brief and practical, written for trained professionals. Singapore English.
- Only answer questions about resourcing a case. If asked for anything else, say this tool only helps match cases to services.
- Format: "## " headings, "- " bullets, **bold** for service names only.

DIRECTORY:
${directory.services.map(s =>
  `[${s.id}] ${s.name} (${s.org}) | categories: ${s.cats.join(", ")} | ${s.desc} | phone: ${s.phone || "n/a"}${s.h24 ? " | 24h" : ""} | ${s.web}`
).join("\n")}`;

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  if (!process.env.ANTHROPIC_API_KEY) return json(500, { error: "The assistant isn't set up yet (missing API key)." });

  let caseText = "";
  try { caseText = ((await req.json())?.caseText || "").toString().trim(); }
  catch { return json(400, { error: "Send the case as JSON." }); }

  if (caseText.length < 15) return json(400, { error: "Describe the case in a bit more detail." });
  if (caseText.length > 4000) return json(400, { error: "Keep the case summary under 4,000 characters." });
  if (PII.some(r => r.test(caseText))) return json(422, { error: "This looks like it has an NRIC, phone number or email in it. Remove identifying details and try again." });

  const anthropic = new Anthropic();
  const enc = new TextEncoder();
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    messages: [{ role: "user", content: caseText }],
  });

  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") controller.enqueue(enc.encode(ev.delta.text));
        }
      } catch (err) {
        console.error("assistant error:", err?.status || "", err?.message || err); // never log caseText
        controller.enqueue(enc.encode("\n\n[The assistant couldn't finish. Try again in a moment.]"));
      } finally {
        controller.close();
      }
    },
    cancel() { stream.abort(); },
  });

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
};

export const config = {
  path: "/api/assistant",
  // Netlify's built-in rate limiting: 10 requests per IP per minute
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
