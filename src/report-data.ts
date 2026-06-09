import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileExists, readTextFile } from "./fs-utils.js";
import type { UsageLedgerEntry } from "./types.js";

export interface RunSummary {
  runDir: string;
  runName: string;
  turns: number;
  hitTokens: number;
  missTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  hitRate: number | null;
}

export interface AggregateSummary {
  runs: number;
  turns: number;
  hitTokens: number;
  missTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  hitRate: number | null;
}

export async function summarizeRunsRoot(root: string): Promise<RunSummary[]> {
  if (!(await fileExists(root))) {
    throw new Error(`Runs root does not exist: ${root}`);
  }

  const entries = await readdir(root, { withFileTypes: true });
  const summaries: RunSummary[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const runDir = path.join(root, entry.name);
    const usagePath = path.join(runDir, "usage.jsonl");
    if (await fileExists(usagePath)) {
      summaries.push(await summarizeRun(runDir));
    }
  }
  return summaries;
}

export async function summarizeRun(runDir: string): Promise<RunSummary> {
  const usagePath = path.join(runDir, "usage.jsonl");
  if (!(await fileExists(usagePath))) {
    throw new Error(`usage.jsonl does not exist: ${usagePath}`);
  }

  const entries = (await readTextFile(usagePath))
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as UsageLedgerEntry);

  let hitTokens = 0;
  let missTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let latencyMs = 0;

  for (const entry of entries) {
    hitTokens += entry.usage.prompt_cache_hit_tokens ?? 0;
    missTokens += entry.usage.prompt_cache_miss_tokens ?? 0;
    promptTokens += entry.usage.prompt_tokens ?? 0;
    completionTokens += entry.usage.completion_tokens ?? 0;
    totalTokens += entry.usage.total_tokens ?? 0;
    latencyMs += entry.latencyMs;
  }

  const cacheTokens = hitTokens + missTokens;
  return {
    runDir,
    runName: path.basename(runDir),
    turns: entries.length,
    hitTokens,
    missTokens,
    promptTokens,
    completionTokens,
    totalTokens,
    latencyMs,
    hitRate: cacheTokens > 0 ? hitTokens / cacheTokens : null
  };
}

export function aggregateSummaries(summaries: RunSummary[]): AggregateSummary {
  const aggregate = summaries.reduce(
    (acc, summary) => {
      acc.turns += summary.turns;
      acc.hitTokens += summary.hitTokens;
      acc.missTokens += summary.missTokens;
      acc.promptTokens += summary.promptTokens;
      acc.completionTokens += summary.completionTokens;
      acc.totalTokens += summary.totalTokens;
      acc.latencyMs += summary.latencyMs;
      return acc;
    },
    {
      turns: 0,
      hitTokens: 0,
      missTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: 0
    }
  );

  const cacheTokens = aggregate.hitTokens + aggregate.missTokens;
  return {
    runs: summaries.length,
    ...aggregate,
    hitRate: cacheTokens > 0 ? aggregate.hitTokens / cacheTokens : null
  };
}
