import type { Config } from "@netlify/functions";

export default async () => {
  const base = Netlify.env.get("URL"), key = Netlify.env.get("ADMIN_KEY");
  if (!base || !key) return;
  const response = await fetch(`${base}/.netlify/functions/job-link-check-background`, {
    method: "POST", headers: { "x-admin-key": key }, redirect: "error",
  });
  if (!response.ok) throw new Error(`Could not start job link checks: ${response.status}`);
};

export const config: Config = { schedule: "0 23 * * *" };
