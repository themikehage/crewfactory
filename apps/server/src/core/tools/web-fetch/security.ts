import dns from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost", "127.0.0.1", "0.0.0.0", "[::1]", "[::]",
]);

const BLOCKED_METADATA_HOSTS = new Set([
  "metadata.google.internal",
  "169.254.169.254",
  "metadata.tencentyun.com",
  "100.100.100.200",
]);

export function validateUrl(urlString: string): { valid: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, reason: `Blocked protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) {
    return { valid: false, reason: `Blocked host: ${hostname}` };
  }
  if (BLOCKED_METADATA_HOSTS.has(hostname) || BLOCKED_METADATA_HOSTS.has(parsed.host)) {
    return { valid: false, reason: "Blocked cloud metadata endpoint" };
  }

  return { valid: true };
}

export function isPrivateIp(ip: string): boolean {
  if (!net.isIPv4(ip)) {
    if (ip === "::1" || ip === "::") return true;
    if (ip.toLowerCase().startsWith("fc00:") || ip.toLowerCase().startsWith("fd00:")) return true;
    if (ip.toLowerCase().startsWith("fe80:")) return true;
    return false;
  }

  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return true;

  if (parts[0] === 127) return true;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  if (parts[0] === 0) return true;

  return false;
}

export async function resolveAndValidate(urlString: string): Promise<
  | { valid: false; reason: string }
  | { valid: true; ip: string; hostname: string; url: URL }
> {
  const validation = validateUrl(urlString);
  if (!validation.valid) {
    return { valid: false, reason: validation.reason || "Invalid URL" };
  }

  const parsed = new URL(urlString);
  try {
    const lookupResult = await dns.lookup(parsed.hostname);
    const address = lookupResult.address;

    if (isPrivateIp(address)) {
      return { valid: false, reason: `Private IP detected: ${address}` };
    }

    return { valid: true, ip: address, hostname: parsed.hostname, url: parsed };
  } catch (error) {
    return { valid: false, reason: `DNS lookup failed for ${parsed.hostname}: ${String(error)}` };
  }
}
