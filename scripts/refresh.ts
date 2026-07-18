const token = process.env.TOKEN || process.env.JWT_TOKEN;
const baseUrl = process.env.BASE_URL || "http://localhost:3000";

function printUsage() {
  console.log(`
Usage: bun run scripts/refresh.ts [options]

Options:
  --type <type>      Type of mutation: 'project', 'agent', 'channel', 'team', 'skill', or 'all' (default: 'all')

`);
}

async function main() {
  let type = "all";

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--type" && i + 1 < process.argv.length) {
      type = process.argv[++i];
    }
  }

  if (!token) {
    console.error("Error: TOKEN or JWT_TOKEN environment variable is not defined.");
    process.exit(1);
  }

  try {
    const res = await fetch(`${baseUrl}/api/workspace/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ type }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    console.log(`Successfully triggered workspace refresh for: ${type}`);
  } catch (err: any) {
    console.error(`Failed to refresh workspace:`, err.message);
    process.exit(1);
  }
}

main();
