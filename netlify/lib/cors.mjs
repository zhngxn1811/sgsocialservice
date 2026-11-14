// Lets the SG Social Services mobile apps call this API.
// iOS apps load from capacitor://localhost, Android apps from https://localhost.
// Add other origins (e.g. a staging site) with the ALLOWED_ORIGINS env var, comma-separated.
// Requests from your own site are same-origin and don't need any of this.
const APP_ORIGINS = ["capacitor://localhost", "https://localhost", "http://localhost"];

export function corsHeaders(req) {
  const origin = req.headers.get("origin") || "";
  const extra = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!origin || ![...APP_ORIGINS, ...extra].includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// Wraps a function handler: answers the browser's OPTIONS pre-check and adds
// the CORS headers to every other response, without changing the response itself.
export function withCors(handler) {
  return async (req, context) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
    const res = await handler(req, context);
    for (const [k, v] of Object.entries(corsHeaders(req))) res.headers.set(k, v);
    return res;
  };
}
