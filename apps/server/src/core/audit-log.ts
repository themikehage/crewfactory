import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const AUDIT_DIR = "/tmp/crewfactory/_audit";

export function auditLog(
  username: string,
  action: string,
  details: Record<string, unknown>
): void {
  try {
    const logDir = join(AUDIT_DIR, username);
    mkdirSync(logDir, { recursive: true });

    const entry = {
      action,
      ...details,
      timestamp: new Date().toISOString(),
    };

    appendFileSync(
      join(logDir, "env-access.log"),
      JSON.stringify(entry) + "\n",
      "utf-8"
    );
  } catch (err) {
    console.error(`[Audit Log] Failed to write audit log for ${username}:`, err);
  }
}
