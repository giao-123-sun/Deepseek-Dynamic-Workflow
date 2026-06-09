#!/usr/bin/env node
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs as parseNodeArgs } from "node:util";
import { loadDotEnv } from "./env.js";
import { ensureDir, fileExists, readTextFile, sha256, writeTextFile } from "./fs-utils.js";
import { stableStringify } from "./stable-json.js";
import type { AgentSession, DeepSeekUsage, UsageLedgerEntry } from "./types.js";

interface ReasonixArgs {
  cwd: string;
  prompt?: string;
  promptFile?: string;
  prefixFile?: string;
  prefixMaxChars: number;
  cacheGroupId: string;
  sessionId: string;
  outDir?: string;
  artifactDir?: string;
  model: string;
  effort: "low" | "medium" | "high" | "max";
  system: string;
  budget?: string;
  reasonixBin: string;
  noProxy: boolean;
}

interface TranscriptEntry {
  role?: string;
  content?: string;
  turn?: number;
  usage?: DeepSeekUsage;
  cost?: number;
  model?: string;
  prefixHash?: string;
  ts?: string;
}

interface ArtifactRecord {
  id: string;
  type: string;
  path: string;
  sha256: string;
  bytes: number;
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));
    args.reasonixBin = await resolveReasonixBin(args.reasonixBin);
    await loadDotEnv([path.join(process.cwd(), ".env"), path.join(args.cwd, ".env")]);

    const task = args.prompt ?? await readTextFile(args.promptFile!);
    const rawImmutablePrefix = args.prefixFile
      ? await readTextFile(args.prefixFile)
      : "ReasoniX harness without external prefix file.";
    const immutablePrefix = compactPrefix(rawImmutablePrefix, args.prefixMaxChars);
    const reasonixTask = [
      "C-FDW CACHE-FIRST STATIC PREFIX",
      "The following prefix is stable across agents in this workflow. Treat it as repository and product context.",
      immutablePrefix,
      "",
      "C-FDW WORKFLOW TASK",
      task
    ].join("\n");
    const sessionId = args.sessionId === "auto"
      ? `reasonix_${sha256(`${Date.now()}_${process.pid}_${task}`).slice(0, 18)}`
      : args.sessionId;
    const outDir = args.outDir ?? path.join(args.cwd, ".cf-dw", "runs", sessionId);
    const artifactDir = args.artifactDir ?? path.join(outDir, "artifacts");
    const transcriptPath = path.join(outDir, "reasonix-transcript.jsonl");
    const usagePath = path.join(outDir, "usage.jsonl");
    const sessionPath = path.join(outDir, "session.json");
    const resultTextPath = path.join(outDir, "result.txt");
    const resultJsonPath = path.join(outDir, "result.json");
    const manifestPath = path.join(outDir, "artifact-manifest.json");
    const summaryArtifactPath = path.join(artifactDir, "summary.md");

    await ensureDir(outDir);
    await ensureDir(artifactDir);

    const result = await runReasonix({
      args,
      task: reasonixTask,
      transcriptPath
    });

    const transcript = await readTranscript(transcriptPath);
    const usageEntries = transcript
      .filter(hasUsage)
      .map((entry, index) => ({
        sessionId,
        cacheGroupId: args.cacheGroupId,
        turn: entry.turn ?? index + 1,
        model: entry.model ?? args.model,
        usage: entry.usage ?? {},
        latencyMs: 0,
        createdAt: entry.ts ?? new Date().toISOString()
      } satisfies UsageLedgerEntry));

    await writeTextFile(
      usagePath,
      usageEntries.map((entry) => stableStringify(entry, 0)).join("\n") + (usageEntries.length ? "\n" : "")
    );

    const final = lastFinal(transcript) ?? result.stdout.trim();
    const session: AgentSession = {
      sessionId,
      cacheGroupId: args.cacheGroupId,
      cwd: args.cwd,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      immutablePrefix,
      appendOnlyLog: [
        { kind: "user_task", content: task },
        { kind: "assistant", turn: usageEntries.length || 1, content: final }
      ],
      finalResult: final
    };

    await writeTextFile(sessionPath, `${stableStringify(session)}\n`);
    await writeTextFile(resultTextPath, final);
    await writeTextFile(summaryArtifactPath, `# ${sessionId}\n\n${final.trim()}\n`);

    const aggregateUsage = aggregateUsageEntries(usageEntries);
    const resultJson = {
      version: "cf-dw.result.v1",
      backend: "reasonix",
      sessionId,
      cacheGroupId: args.cacheGroupId,
      cwd: args.cwd,
      model: args.model,
      effort: args.effort,
      createdAt: session.createdAt,
      summary: final.trim(),
      metrics: aggregateUsage
    };
    await writeTextFile(resultJsonPath, `${stableStringify(resultJson)}\n`);

    const artifacts = [
      await artifactRecord(args.cwd, "result_text", "text", resultTextPath),
      await artifactRecord(args.cwd, "result_json", "json", resultJsonPath),
      await artifactRecord(args.cwd, "summary", "markdown", summaryArtifactPath),
      await artifactRecord(args.cwd, "reasonix_transcript", "jsonl", transcriptPath)
    ];

    const manifest = {
      version: "cf-dw.artifact.v1",
      workflowId: extractMetadata(task, "C_FDW_WORKFLOW") ?? "unknown",
      phaseId: extractMetadata(task, "C_FDW_PHASE") ?? "unknown",
      agentId: extractMetadata(task, "C_FDW_AGENT") ?? sessionId,
      sessionId,
      cacheGroupId: args.cacheGroupId,
      backend: "reasonix",
      summary: final.trim(),
      artifacts,
      metrics: aggregateUsage,
      nextInputs: artifacts
        .filter((artifact) => artifact.id === "result_json" || artifact.id === "summary")
        .map((artifact) => ({
          label: artifact.id,
          path: artifact.path
        }))
    };
    await writeTextFile(manifestPath, `${stableStringify(manifest)}\n`);

    process.stdout.write(final.trim());
    process.stdout.write("\n");
    process.stderr.write(`[c-fdw-reasonix] transcript: ${transcriptPath}\n`);
    process.stderr.write(`[c-fdw-reasonix] usage: ${usagePath}\n`);
    process.stderr.write(`[c-fdw-reasonix] manifest: ${manifestPath}\n`);
  } catch (error) {
    process.stderr.write(`[c-fdw-reasonix] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

function parseArgs(argv: string[]): ReasonixArgs {
  const parsed = parseNodeArgs({
    args: argv,
    allowPositionals: false,
    options: {
      cwd: { type: "string" },
      prompt: { type: "string" },
      "prompt-file": { type: "string" },
      "prefix-file": { type: "string" },
      "prefix-max-chars": { type: "string" },
      "cache-group-id": { type: "string" },
      "session-id": { type: "string" },
      "out-dir": { type: "string" },
      "artifact-dir": { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
      system: { type: "string" },
      budget: { type: "string" },
      "reasonix-bin": { type: "string" },
      "no-proxy": { type: "boolean" }
    }
  });

  const cwd = path.resolve(String(parsed.values.cwd ?? process.cwd()));
  const prompt = parsed.values.prompt;
  const promptFile = parsed.values["prompt-file"]
    ? path.resolve(cwd, String(parsed.values["prompt-file"]))
    : undefined;
  const prefixFile = parsed.values["prefix-file"]
    ? path.resolve(cwd, String(parsed.values["prefix-file"]))
    : undefined;

  if (!prompt && !promptFile) {
    throw new Error("Provide either --prompt or --prompt-file.");
  }

  const effort = String(parsed.values.effort ?? "low") as ReasonixArgs["effort"];
  if (!["low", "medium", "high", "max"].includes(effort)) {
    throw new Error("--effort must be low, medium, high, or max.");
  }
  const prefixMaxChars = Number(parsed.values["prefix-max-chars"] ?? 12000);
  if (!Number.isFinite(prefixMaxChars) || prefixMaxChars <= 0) {
    throw new Error("--prefix-max-chars must be a positive number.");
  }

  return {
    cwd,
    prompt,
    promptFile,
    prefixFile,
    prefixMaxChars,
    cacheGroupId: String(parsed.values["cache-group-id"] ?? "cf_dw_reasonix_v1"),
    sessionId: String(parsed.values["session-id"] ?? "auto"),
    outDir: parsed.values["out-dir"] ? path.resolve(cwd, String(parsed.values["out-dir"])) : undefined,
    artifactDir: parsed.values["artifact-dir"] ? path.resolve(cwd, String(parsed.values["artifact-dir"])) : undefined,
    model: String(parsed.values.model ?? "deepseek-v4-flash"),
    effort,
    system: String(
      parsed.values.system ??
        [
          "You are a non-interactive subagent inside an Open Dynamic Workflows run.",
          "Complete the user task directly from the provided C-FDW static prefix and task text.",
          "Do not request an upgrade, do not emit NEEDS_PRO, and do not ask clarifying questions.",
          "Do not emit run_skill blocks, tool-call markup, commands for the host to run, or instructions for another agent.",
          "If the task asks for code or file analysis, use the provided prefix context and produce the requested analysis directly."
        ].join(" ")
    ),
    budget: parsed.values.budget ? String(parsed.values.budget) : undefined,
    reasonixBin: String(parsed.values["reasonix-bin"] ?? "reasonix"),
    noProxy: Boolean(parsed.values["no-proxy"])
  };
}

function runReasonix(options: {
  args: ReasonixArgs;
  task: string;
  transcriptPath: string;
}): Promise<{ stdout: string; stderr: string }> {
  const argv = [
    "run",
    "--no-config",
    "--model",
    options.args.model,
    "--system",
    options.args.system,
    "--effort",
    options.args.effort,
    "--transcript",
    options.transcriptPath
  ];

  if (options.args.noProxy) argv.push("--no-proxy");
  if (options.args.budget) argv.push("--budget", options.args.budget);
  argv.push(options.task);

  return new Promise((resolve, reject) => {
    const command = options.args.reasonixBin.endsWith(".js") ? process.execPath : options.args.reasonixBin;
    const commandArgs = options.args.reasonixBin.endsWith(".js")
      ? [options.args.reasonixBin, ...argv]
      : argv;

    const child = spawn(command, commandArgs, {
      cwd: options.args.cwd,
      env: process.env,
      shell: false
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`reasonix exited with code ${code}: ${stderr || stdout}`));
    });
  });
}

async function resolveReasonixBin(input: string): Promise<string> {
  if (input !== "reasonix") return path.resolve(input);

  const local = path.resolve("node_modules", "reasonix", "dist", "cli", "index.js");
  if (await fileExists(local)) return local;

  return input;
}

async function readTranscript(transcriptPath: string): Promise<TranscriptEntry[]> {
  const text = await readTextFile(transcriptPath);
  const entries: TranscriptEntry[] = [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  for (const [index, line] of lines.entries()) {
    try {
      entries.push(JSON.parse(line) as TranscriptEntry);
    } catch {
      process.stderr.write(`[c-fdw-reasonix] skipped invalid transcript line ${index + 1}\n`);
    }
  }
  return entries;
}

function hasUsage(entry: TranscriptEntry): entry is TranscriptEntry & { usage: DeepSeekUsage } {
  return Boolean(entry.usage && typeof entry.usage === "object");
}

function lastFinal(entries: TranscriptEntry[]): string | undefined {
  for (const entry of [...entries].reverse()) {
    if (entry.role === "done" && typeof entry.content === "string") return entry.content;
    if (entry.role === "assistant_final" && typeof entry.content === "string") return entry.content;
  }
  return undefined;
}

function aggregateUsageEntries(entries: UsageLedgerEntry[]): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  cacheHitRate: number | null;
} {
  const totals = entries.reduce(
    (acc, entry) => {
      acc.promptTokens += entry.usage.prompt_tokens ?? 0;
      acc.completionTokens += entry.usage.completion_tokens ?? 0;
      acc.totalTokens += entry.usage.total_tokens ?? 0;
      acc.cacheHitTokens += entry.usage.prompt_cache_hit_tokens ?? 0;
      acc.cacheMissTokens += entry.usage.prompt_cache_miss_tokens ?? 0;
      return acc;
    },
    {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cacheHitTokens: 0,
      cacheMissTokens: 0
    }
  );

  const cacheTokens = totals.cacheHitTokens + totals.cacheMissTokens;
  return {
    ...totals,
    cacheHitRate: cacheTokens > 0 ? totals.cacheHitTokens / cacheTokens : null
  };
}

async function artifactRecord(
  cwd: string,
  id: string,
  type: string,
  artifactPath: string
): Promise<ArtifactRecord> {
  const content = await readTextFile(artifactPath);
  const fileStat = await stat(artifactPath);
  return {
    id,
    type,
    path: path.relative(cwd, artifactPath).split(path.sep).join("/"),
    sha256: sha256(content),
    bytes: fileStat.size
  };
}

function extractMetadata(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

function compactPrefix(prefix: string, maxChars: number): string {
  if (prefix.length <= maxChars) {
    return prefix;
  }

  const hash = sha256(prefix);
  return [
    `C_FDW_PREFIX_SHA256: ${hash}`,
    `C_FDW_PREFIX_COMPACTED_CHARS: ${maxChars}`,
    prefix.slice(0, maxChars),
    "",
    "[C-FDW prefix compacted for ReasoniX CLI argv safety]"
  ].join("\n");
}

await main();
