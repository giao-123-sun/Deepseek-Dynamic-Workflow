#!/usr/bin/env node
import path from "node:path";
import { aggregateSummaries, summarizeRun, summarizeRunsRoot, type RunSummary } from "./report-data.js";

interface ReportArgs {
  runDir?: string;
  runsRoot?: string;
  plain: boolean;
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));
    const summaries = args.runDir
      ? [await summarizeRun(path.resolve(args.runDir))]
      : await summarizeRunsRoot(path.resolve(args.runsRoot ?? ".cf-dw/runs"));

    if (args.plain) printPlainSummaries(summaries);
    else printVisualSummaries(summaries);
  } catch (error) {
    process.stderr.write(`[c-fdw-report] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

function parseArgs(argv: string[]): ReportArgs {
  const args: ReportArgs = { plain: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--plain") {
      args.plain = true;
      continue;
    }

    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }

    if (key === "--run-dir") args.runDir = value;
    else if (key === "--runs-root") args.runsRoot = value;
    else throw new Error(`Unknown option: ${key}`);
    i += 1;
  }

  if (args.runDir && args.runsRoot) {
    throw new Error("Use either --run-dir or --runs-root, not both.");
  }

  return args;
}

function printPlainSummaries(summaries: RunSummary[]): void {
  for (const summary of summaries) {
    const hitRate = summary.hitRate === null ? "n/a" : `${(summary.hitRate * 100).toFixed(2)}%`;
    console.log(
      [
        `run=${summary.runName}`,
        `turns=${summary.turns}`,
        `hit=${summary.hitTokens}`,
        `miss=${summary.missTokens}`,
        `hit_rate=${hitRate}`,
        `prompt=${summary.promptTokens}`,
        `completion=${summary.completionTokens}`,
        `total=${summary.totalTokens}`,
        `latency_ms=${summary.latencyMs}`
      ].join(" ")
    );
  }

  if (summaries.length > 1) {
    const aggregate = aggregateSummaries(summaries);
    const hitRate = aggregate.hitRate === null ? "n/a" : `${(aggregate.hitRate * 100).toFixed(2)}%`;
    console.log(
      [
        "aggregate",
        `runs=${summaries.length}`,
        `turns=${aggregate.turns}`,
        `hit=${aggregate.hitTokens}`,
        `miss=${aggregate.missTokens}`,
        `hit_rate=${hitRate}`,
        `prompt=${aggregate.promptTokens}`,
        `completion=${aggregate.completionTokens}`,
        `total=${aggregate.totalTokens}`,
        `latency_ms=${aggregate.latencyMs}`
      ].join(" ")
    );
  }
}

function printVisualSummaries(summaries: RunSummary[]): void {
  if (summaries.length === 0) {
    console.log("No runs found.");
    return;
  }

  const aggregate = aggregateSummaries(summaries);
  console.log("");
  console.log("C-FDW Cache Report");
  console.log("==================");
  console.log(`Runs: ${aggregate.runs}  Turns: ${aggregate.turns}  Hit Rate: ${formatRate(aggregate.hitRate)}`);
  console.log(`Tokens: prompt=${aggregate.promptTokens} completion=${aggregate.completionTokens} total=${aggregate.totalTokens}`);
  console.log(`Latency: ${aggregate.latencyMs} ms`);
  console.log(`Cache: ${aggregate.hitTokens} hit / ${aggregate.missTokens} miss`);
  console.log(`       ${bar(aggregate.hitRate, 34)} ${formatRate(aggregate.hitRate)}`);
  console.log("");

  const headers = ["Run", "Turns", "Hit Rate", "Cache", "Prompt", "Comp", "Latency"];
  const rows = summaries.map((summary) => [
    summary.runName,
    String(summary.turns),
    formatRate(summary.hitRate),
    bar(summary.hitRate, 18),
    String(summary.promptTokens),
    String(summary.completionTokens),
    `${summary.latencyMs}ms`
  ]);

  printTable(headers, rows);
}

function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length))
  );
  const line = `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`;
  console.log(line);
  console.log(`|${headers.map((header, index) => ` ${header.padEnd(widths[index])} `).join("|")}|`);
  console.log(line);
  for (const row of rows) {
    console.log(`|${row.map((cell, index) => ` ${cell.padEnd(widths[index])} `).join("|")}|`);
  }
  console.log(line);
}

function bar(rate: number | null, width: number): string {
  if (rate === null) return `[${"?".repeat(width)}]`;
  const filled = Math.round(rate * width);
  return `[${"#".repeat(filled)}${"-".repeat(width - filled)}]`;
}

function formatRate(rate: number | null): string {
  return rate === null ? "n/a" : `${(rate * 100).toFixed(2)}%`;
}

await main();
