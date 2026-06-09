#!/usr/bin/env node
import { HelpRequested, parseArgs, usage } from "./args.js";
import { runAgentSession } from "./run-agent-session.js";

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await runAgentSession(options);

    process.stdout.write(result.content.trim());
    process.stdout.write("\n");

    const hitRateText = result.hitRate === null ? "n/a" : `${(result.hitRate * 100).toFixed(2)}%`;
    process.stderr.write(`\n[c-fdw] session: ${result.sessionPath}\n`);
    process.stderr.write(`[c-fdw] usage: ${result.usagePath}\n`);
    process.stderr.write(`[c-fdw] workflow hit rate: ${hitRateText}\n`);
  } catch (error) {
    if (error instanceof HelpRequested) {
      process.stdout.write(`${usage()}\n`);
      return;
    }

    process.stderr.write(`[c-fdw] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

await main();
