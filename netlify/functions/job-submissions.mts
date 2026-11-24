import { randomUUID } from "node:crypto";
import type { Config } from "@netlify/functions";
import { getDb } from "../../db/index.js";
import { jobs } from "../../db/schema.js";
import { manualJob } from "../lib/jobs.mjs";
import { orgOverrides } from "../lib/jobs-sync.mjs";
import { sgDay } from "../lib/usage.mjs";

const json = (status: number, body: unknown) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

export default async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Submit the job using the form." });
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json(415, { error: "Send the job as JSON." });
  }

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 8_000) return json(413, { error: "The submission is too long." });
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "Send the job as JSON." });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Send the job as JSON." });
  if (body.website) return json(201, { ok: true });

  const submittedUrl = typeof body.apply_url === "string" ? body.apply_url.trim() : "";
  const listing = /^https:\/\/[^/\\]/i.test(submittedUrl) && URL.canParse(submittedUrl) ? new URL(submittedUrl) : null;
  const siteHosts = [new URL(req.url).hostname, "sgsocialservices.app", "sgsocialservices.netlify.app"];
  const listingHost = listing?.hostname.replace(/\.$/, "");
  if (!listing || listing.username || listing.password || listing.href.length > 500 ||
      siteHosts.some(host => listingHost === host || listingHost === `www.${host}` || listingHost?.endsWith(`--${host}`))) {
    return json(400, { error: "Enter an external job listing URL starting with https://." });
  }

  const made = manualJob({
    title: body.title, org: body.org, apply_url: listing.href, source_name: "External listing",
    employment_type: body.employment_type, closes_at: body.closes_at,
  }, sgDay(), orgOverrides);
  if ("error" in made) return json(400, { error: made.error });

  try {
    const id = `submitted-${randomUUID()}`;
    await getDb().insert(jobs).values({ ...made.job, id, source_id: id, source: "submission", status: "pending" });
    return json(201, { ok: true });
  } catch {
    return json(500, { error: "Couldn't submit the job. Try again in a moment." });
  }
};

export const config: Config = {
  path: "/api/job-submissions",
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
