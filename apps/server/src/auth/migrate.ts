import { getMigrations } from "better-auth/db/migration";
import { auth } from "./index";

export async function ensureAuthTables(): Promise<void> {
  try {
    const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
    if (toBeCreated.length > 0 || toBeAdded.length > 0) {
      console.log(
        `[Auth] Running migrations: ${toBeCreated.length} tables to create, ${toBeAdded.length} tables to update`
      );
    }
    await runMigrations();
  } catch (err) {
    console.error("[Auth] Failed to run migrations, falling back to minimal schema check:", err);
  }
}
