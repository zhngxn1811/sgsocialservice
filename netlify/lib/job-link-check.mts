import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { applicationUrl } from "./jobs.mjs";

const ipv4Reserved = new BlockList();
for (const [prefix, length] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) ipv4Reserved.addSubnet(prefix, length);

const ipv6Global = new BlockList();
ipv6Global.addSubnet("2000::", 3, "ipv6");
const ipv6Reserved = new BlockList();
for (const [prefix, length] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) {
  ipv6Reserved.addSubnet(prefix, length, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !ipv4Reserved.check(address);
  return family === 6 && ipv6Global.check(address, "ipv6") && !ipv6Reserved.check(address, "ipv6");
}

type LinkResponse = { status: number; location?: string };
type ReadLink = (url: URL, signal: AbortSignal) => Promise<LinkResponse>;
const readLink: ReadLink = (url, signal) => new Promise((resolve, reject) => {
  const req = request(url, {
    signal, agent: false,
    headers: { "User-Agent": "SGSocialServices-JobsBoard/1.0", "Accept": "text/html,*/*;q=0.1" },
    lookup(hostname, options, callback) {
      lookup(hostname, { all: true }).then(addresses => {
        const chosen = addresses[0];
        if (!chosen || addresses.some(address => !isPublicAddress(address.address))) {
          callback(new Error("Non-public destination"), "", 4);
        } else if (options.all) {
          callback(null, addresses);
        } else {
          callback(null, chosen.address, chosen.family);
        }
      }, error => callback(error, "", 4));
    },
  }, response => {
    resolve({ status: response.statusCode || 0, location: response.headers.location });
    response.destroy();
  });
  req.on("error", reject);
  req.end();
});

export async function checkJobLink(link: string, read: ReadLink = readLink): Promise<number | null> {
  const signal = AbortSignal.timeout(6_000);
  let current = link;
  try {
    for (let hop = 0; hop < 5; hop++) {
      const url = applicationUrl(current);
      const hostname = url?.hostname.replace(/\.$/, "") || "";
      if (!url || url.protocol !== "https:" || url.port || !hostname.includes(".") || isIP(hostname)) return null;
      const { status, location } = await read(url, signal);
      if (![301, 302, 303, 307, 308].includes(status)) return status;
      if (!location) return null;
      current = new URL(location, url).href;
    }
  } catch {
    return null;
  }
  return null;
}

export function linkCheckUpdate(status: number | null, previousCount: number) {
  if (status === 404 || status === 410) return { link_missing_count: Math.min(previousCount + 1, 2), link_missing_code: status };
  if (status !== null && status >= 200 && status < 300) return { link_missing_count: 0, link_missing_code: null };
  return {};
}
