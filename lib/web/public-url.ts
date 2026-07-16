import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.azure.internal",
  "instance-data.ec2.internal",
]);

function blockedIpv4(address: string) {
  const parts = address.split(".").map(Number);
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0)
    || a >= 224;
}

function blockedIpv6(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized) || normalized.startsWith("ff")) return true;
  if (normalized.startsWith("2001:db8:")) return true;
  if (normalized.startsWith("::ffff:")) return true;
  return false;
}

export function parsePublicUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2_048) {
    throw new TypeError("A valid public URL is required.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("A valid public URL is required.");
  }

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new TypeError("Only public HTTP(S) URLs without credentials are allowed.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname
    || BLOCKED_HOSTS.has(hostname)
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || hostname.endsWith(".lan")) {
    throw new TypeError("Local and private URLs are not allowed.");
  }

  const version = isIP(hostname);
  if ((version === 4 && blockedIpv4(hostname)) || (version === 6 && blockedIpv6(hostname))) {
    throw new TypeError("Local and private URLs are not allowed.");
  }

  return url;
}
