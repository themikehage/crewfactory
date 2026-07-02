#!/usr/bin/env bun
/**
 * CLI script to run the multi-agent vs single-agent efficiency benchmark.
 * Usage: bun run scripts/benchmark.ts --channel <channel_id>
 */

import { parseArgs } from "util";
import { runBenchmarkSuite } from "../apps/server/src/benchmark/harness.js";

// Default user
const USERNAME = "admin";

async function main() {
  const { values } = parseArgs({
    options: {
      channel: { type: "string" },
    },
  });

  const channelId = values.channel;
  if (!channelId) {
    console.error("Error: --channel <id> is required.");
    process.exit(1);
  }

  console.log(`\n========================================`);
  console.log(`Starting Benchmark for Channel: ${channelId}`);
  console.log(`========================================\n`);

  const report = await runBenchmarkSuite(USERNAME, channelId, (msg) => {
    console.log(`  [Progress] ${msg}`);
  });

  console.log(`\n[OK] Benchmark completed successfully.`);
  console.log(`\nSummary:\n${report.split("\n\n")[2]}`);
}

main().catch((err) => {
  console.error("[ERROR]", err);
  process.exit(1);
});
