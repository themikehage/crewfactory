import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dryRun = process.argv.includes("--dry-run");

const TEMP_BASE = "C:\\tmp";
const WORKSPACE_BASE = "c:\\Users\\themi\\AgentWorkspace\\crewfactory";

const oldAgentsDir = join(TEMP_BASE, "pi-agents");
const oldChannelsDir = join(TEMP_BASE, "pi-channels");
const oldCrewfactoryDir = join(TEMP_BASE, "crewfactory");

const newBaseDir = join(TEMP_BASE, "crewfactory", "admin");
const newAgentsDir = join(newBaseDir, "agents");
const newChannelsDir = join(newBaseDir, "channels");

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = join(WORKSPACE_BASE, "backups", timestamp);

console.log(`=== Storage Migration Script ===`);
if (dryRun) {
  console.log(`[DRY RUN] No changes will be written.`);
}
console.log(`Backup destination: ${backupDir}\n`);

// 1. Snapshot / Backup
function backup() {
  console.log(`--- Creating Backup ---`);
  if (!dryRun && !existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const dirsToBackup = [
    { name: "pi-agents", path: oldAgentsDir },
    { name: "pi-channels", path: oldChannelsDir },
    { name: "crewfactory", path: oldCrewfactoryDir }
  ];

  for (const dir of dirsToBackup) {
    if (existsSync(dir.path)) {
      console.log(`Backing up ${dir.path} to ${join(backupDir, dir.name)}`);
      if (!dryRun) {
        cpSync(dir.path, join(backupDir, dir.name), { recursive: true });
      }
    } else {
      console.log(`Source ${dir.path} does not exist. Skipping backup.`);
    }
  }
}

// 2. Migration
function migrate() {
  console.log(`\n--- Running Migration ---`);
  
  // Agents migration
  if (existsSync(oldAgentsDir)) {
    const agents = readdirSync(oldAgentsDir, { withFileTypes: true });
    for (const agent of agents) {
      if (agent.isDirectory()) {
        const src = join(oldAgentsDir, agent.name);
        const dest = join(newAgentsDir, agent.name);
        console.log(`Migrating agent: ${agent.name} -> ${dest}`);
        if (!dryRun) {
          mkdirSync(newBaseDir, { recursive: true });
          mkdirSync(newAgentsDir, { recursive: true });
          cpSync(src, dest, { recursive: true });
        }
      }
    }
  }

  // Channels migration
  if (existsSync(oldChannelsDir)) {
    const channels = readdirSync(oldChannelsDir, { withFileTypes: true });
    for (const channel of channels) {
      if (channel.isDirectory()) {
        const src = join(oldChannelsDir, channel.name);
        const dest = join(newChannelsDir, channel.name);
        console.log(`Migrating channel: ${channel.name} -> ${dest}`);
        if (!dryRun) {
          mkdirSync(newBaseDir, { recursive: true });
          mkdirSync(newChannelsDir, { recursive: true });
          cpSync(src, dest, { recursive: true });
        }
      }
    }
  }
  
  console.log(`\nMigration completed successfully.`);
}

try {
  backup();
  migrate();
} catch (error) {
  console.error(`Migration failed:`, error);
  process.exit(1);
}
