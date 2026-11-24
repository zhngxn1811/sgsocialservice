// Every day at 6am Singapore time (22:00 UTC), start the jobs refresh in the background.
// Scheduled functions stop after 30 seconds, so this only kicks off jobs-sync-background.mts.
import type { Config } from "@netlify/functions";

export default async () => {
  const base = Netlify.env.get("URL"), key = Netlify.env.get("ADMIN_KEY");
  if (!base || !key) { console.error("jobs sync not started: set ADMIN_KEY in Netlify"); return; }
  const res = await fetch(`${base}/.netlify/functions/jobs-sync-background`, { method: "POST", headers: { "x-admin-key": key } });
  console.log("jobs sync started", res.status);
};

export const config: Config = { schedule: "0 22 * * *" };
