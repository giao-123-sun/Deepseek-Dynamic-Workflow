#!/usr/bin/env node
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileExists, readTextFile, writeTextFile } from "../fs-utils.js";
import { summarizeRunsRoot, type RunSummary } from "../report-data.js";

interface DemoSpec {
  name: string;
  tag: string;
  script: string;
}

interface ReleaseAuditArgs {
  cwd: string;
  runsRoot: string;
  threshold: number;
  output?: string;
  json: boolean;
}

interface Gate {
  name: string;
  passed: boolean;
  detail: string;
}

interface RunRecord {
  workflow: string;
  phase: string;
  agent: string;
  runName: string;
  runDir: string;
  createdAt: string;
  createdAtMs: number;
  hitTokens: number;
  missTokens: number;
  totalTokens: number;
  backend: string;
  artifactCount: number;
  transcriptLines: number;
}

interface DemoAudit {
  name: string;
  tag: string;
  agents: number;
  phases: number;
  reasonixAgents: number;
  artifactAgents: number;
  transcriptLines: number;
  hitTokens: number;
  missTokens: number;
  totalTokens: number;
  hitRate: number | null;
  passed: boolean;
  issues: string[];
}

interface ReleaseAudit {
  generatedAt: string;
  cwd: string;
  threshold: number;
  gates: Gate[];
  demos: DemoAudit[];
  aggregate: {
    demos: number;
    agents: number;
    reasonixAgents: number;
    artifactAgents: number;
    hitTokens: number;
    missTokens: number;
    totalTokens: number;
    hitRate: number | null;
    passed: boolean;
  };
  passed: boolean;
}

const DEMOS: DemoSpec[] = [
  {
    name: "cache-roi-benchmark",
    tag: "demo-cache-roi-benchmark",
    script: "examples/demos/cache-roi-benchmark.js"
  },
  {
    name: "codebase-architecture-audit",
    tag: "demo-codebase-architecture-audit",
    script: "examples/demos/codebase-architecture-audit.js"
  },
  {
    name: "policy-conflict-mining",
    tag: "demo-policy-conflict-mining",
    script: "examples/demos/policy-conflict-mining.js"
  },
  {
    name: "multi-city-deep-research",
    tag: "demo-multi-city-deep-research",
    script: "examples/demos/multi-city-deep-research.js"
  },
  {
    name: "web-cdp-evidence-extraction",
    tag: "demo-web-cdp-evidence-extraction",
    script: "examples/demos/web-cdp-evidence-extraction.js"
  }
];

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));
    const audit = await runReleaseAudit(args);
    const rendered = args.json ? `${JSON.stringify(audit, null, 2)}\n` : renderAudit(audit);
    process.stdout.write(rendered);
    if (args.output) {
      await writeTextFile(path.resolve(args.cwd, args.output), `${JSON.stringify(audit, null, 2)}\n`);
    }
    if (!audit.passed) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`[c-fdw-release-audit] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

async function runReleaseAudit(args: ReleaseAuditArgs): Promise<ReleaseAudit> {
  const gates = await auditProjectFiles(args.cwd);
  const records = latestRecords(await readRunRecords(args.runsRoot));
  const demos = DEMOS.map((demo) => auditDemo(demo, records, args.threshold));

  const hitTokens = demos.reduce((sum, demo) => sum + demo.hitTokens, 0);
  const missTokens = demos.reduce((sum, demo) => sum + demo.missTokens, 0);
  const totalTokens = demos.reduce((sum, demo) => sum + demo.totalTokens, 0);
  const cacheTokens = hitTokens + missTokens;
  const hitRate = cacheTokens > 0 ? hitTokens / cacheTokens : null;
  const aggregate = {
    demos: demos.length,
    agents: demos.reduce((sum, demo) => sum + demo.agents, 0),
    reasonixAgents: demos.reduce((sum, demo) => sum + demo.reasonixAgents, 0),
    artifactAgents: demos.reduce((sum, demo) => sum + demo.artifactAgents, 0),
    hitTokens,
    missTokens,
    totalTokens,
    hitRate,
    passed: demos.every((demo) => demo.passed) && hitRate !== null && hitRate >= args.threshold
  };

  gates.push({
    name: "five-demo-cache-threshold",
    passed: aggregate.passed,
    detail: `${DEMOS.length} demos, ${aggregate.agents} agents, hit rate ${formatRate(hitRate)}`
  });

  return {
    generatedAt: new Date().toISOString(),
    cwd: args.cwd,
    threshold: args.threshold,
    gates,
    demos,
    aggregate,
    passed: gates.every((gate) => gate.passed) && aggregate.passed
  };
}

async function auditProjectFiles(cwd: string): Promise<Gate[]> {
  const gates: Gate[] = [];
  const requiredFiles = [
    "README.md",
    "LICENSE.md",
    "NOTICE.md",
    ".github/workflows/ci.yml",
    "assets/cf-dw-hero.png",
    "assets/cf-dw-architecture.png",
    "odw.config.json",
    "odw.reasonix.config.json",
    "odw.mixed.config.json"
  ];

  for (const file of requiredFiles) {
    gates.push({
      name: `file:${file}`,
      passed: await fileExists(path.join(cwd, file)),
      detail: file
    });
  }

  for (const demo of DEMOS) {
    const scriptPath = path.join(cwd, demo.script);
    const scriptExists = await fileExists(scriptPath);
    gates.push({
      name: `demo-script:${demo.name}`,
      passed: scriptExists,
      detail: demo.script
    });
    gates.push({
      name: `structured-handoff:${demo.name}`,
      passed: scriptExists && (await readTextFile(scriptPath)).includes("cf-dw.structured-handoff.v1"),
      detail: `${demo.script} uses compact structured handoff.`
    });
  }

  const readme = await readTextFile(path.join(cwd, "README.md"));
  gates.push({
    name: "readme-positioning",
    passed: readme.includes("Project Positioning / 项目定位"),
    detail: "README includes bilingual positioning section."
  });
  gates.push({
    name: "readme-images",
    passed: readme.includes("assets/cf-dw-hero.png") && readme.includes("assets/cf-dw-architecture.png"),
    detail: "README references CFDW hero and architecture images."
  });

  const license = await readTextFile(path.join(cwd, "LICENSE.md"));
  gates.push({
    name: "non-commercial-license",
    passed: /non-commercial/i.test(license) && /commercial use/i.test(license),
    detail: "LICENSE reserves commercial use."
  });

  const envExample = await readTextFile(path.join(cwd, ".env.example"));
  gates.push({
    name: "env-example-no-secret",
    passed: !/sk-[A-Za-z0-9]{8,}/.test(envExample),
    detail: ".env.example contains no API key."
  });

  return gates;
}

async function readRunRecords(runsRoot: string): Promise<RunRecord[]> {
  const summaries = await summarizeRunsRoot(runsRoot);
  const records: RunRecord[] = [];
  for (const summary of summaries) {
    const record = await readRunRecord(summary);
    if (record) records.push(record);
  }
  return records;
}

async function readRunRecord(summary: RunSummary): Promise<RunRecord | undefined> {
  const sessionPath = path.join(summary.runDir, "session.json");
  if (!(await fileExists(sessionPath))) return undefined;
  const session = JSON.parse(await readTextFile(sessionPath)) as {
    sessionId?: string;
    createdAt?: string;
    appendOnlyLog?: Array<Record<string, unknown>>;
  };
  const taskEntry = session.appendOnlyLog?.find((entry) => entry.kind === "user_task");
  const task = String(taskEntry?.content ?? "");
  const workflow = matchLine(task, "C_FDW_WORKFLOW");
  if (!workflow) return undefined;

  const manifest = await readManifest(summary.runDir);
  const runStat = await stat(summary.runDir);
  const createdAt = session.createdAt ?? runStat.mtime.toISOString();
  const createdAtMs = Date.parse(createdAt);

  return {
    workflow,
    phase: matchLine(task, "C_FDW_PHASE") ?? "unknown-phase",
    agent: matchLine(task, "C_FDW_AGENT") ?? session.sessionId ?? summary.runName,
    runName: summary.runName,
    runDir: summary.runDir,
    createdAt,
    createdAtMs: Number.isNaN(createdAtMs) ? runStat.mtimeMs : createdAtMs,
    hitTokens: summary.hitTokens,
    missTokens: summary.missTokens,
    totalTokens: summary.totalTokens,
    backend: manifest.backend,
    artifactCount: manifest.artifactCount,
    transcriptLines: await countTranscriptLines(summary.runDir)
  };
}

async function readManifest(runDir: string): Promise<{ backend: string; artifactCount: number }> {
  const manifestPath = path.join(runDir, "artifact-manifest.json");
  if (!(await fileExists(manifestPath))) {
    return { backend: "native-cfdw", artifactCount: 0 };
  }
  const manifest = JSON.parse(await readTextFile(manifestPath)) as {
    backend?: string;
    artifacts?: unknown[];
  };
  return {
    backend: manifest.backend ?? "unknown",
    artifactCount: manifest.artifacts?.length ?? 0
  };
}

async function countTranscriptLines(runDir: string): Promise<number> {
  const transcriptPath = path.join(runDir, "reasonix-transcript.jsonl");
  if (!(await fileExists(transcriptPath))) return 0;
  return (await readTextFile(transcriptPath)).split(/\r?\n/).filter((line) => line.trim()).length;
}

function latestRecords(records: RunRecord[]): RunRecord[] {
  const byAgent = new Map<string, RunRecord>();
  for (const record of records) {
    const key = `${record.workflow}\n${record.phase}\n${record.agent}`;
    const previous = byAgent.get(key);
    if (!previous || record.createdAtMs >= previous.createdAtMs) {
      byAgent.set(key, record);
    }
  }
  return Array.from(byAgent.values());
}

function auditDemo(demo: DemoSpec, records: RunRecord[], threshold: number): DemoAudit {
  const demoRecords = records.filter((record) => record.workflow === demo.tag);
  const hitTokens = demoRecords.reduce((sum, record) => sum + record.hitTokens, 0);
  const missTokens = demoRecords.reduce((sum, record) => sum + record.missTokens, 0);
  const totalTokens = demoRecords.reduce((sum, record) => sum + record.totalTokens, 0);
  const cacheTokens = hitTokens + missTokens;
  const hitRate = cacheTokens > 0 ? hitTokens / cacheTokens : null;
  const phases = new Set(demoRecords.map((record) => record.phase)).size;
  const reasonixAgents = demoRecords.filter((record) => record.backend === "reasonix").length;
  const artifactAgents = demoRecords.filter((record) => record.artifactCount > 0).length;
  const transcriptLines = demoRecords.reduce((sum, record) => sum + record.transcriptLines, 0);
  const issues: string[] = [];

  if (demoRecords.length === 0) issues.push("missing demo run records");
  if (hitRate === null || hitRate < threshold) issues.push(`cache hit below ${formatRate(threshold)}`);
  if (reasonixAgents === 0) issues.push("missing ReasoniX harness agent");
  if (artifactAgents === 0) issues.push("missing artifact-manifest output");
  if (transcriptLines < Math.max(2, reasonixAgents)) issues.push("missing multi-step ReasoniX transcript evidence");

  return {
    name: demo.name,
    tag: demo.tag,
    agents: demoRecords.length,
    phases,
    reasonixAgents,
    artifactAgents,
    transcriptLines,
    hitTokens,
    missTokens,
    totalTokens,
    hitRate,
    passed: issues.length === 0,
    issues
  };
}

function parseArgs(argv: string[]): ReleaseAuditArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--help") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (key === "--json") {
      flags.add("json");
      continue;
    }
    const value = argv[i + 1];
    if (!key.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    values.set(key.slice(2), value);
    i += 1;
  }

  const cwd = path.resolve(values.get("cwd") ?? process.cwd());
  const threshold = Number(values.get("threshold") ?? "0.8");
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error("--threshold must be a number between 0 and 1.");
  }

  return {
    cwd,
    runsRoot: path.resolve(cwd, values.get("runs-root") ?? ".cf-dw/runs"),
    threshold,
    output: values.get("output"),
    json: flags.has("json")
  };
}

function usage(): string {
  return [
    "Usage:",
    "  cf-dw-release-audit --runs-root .cf-dw/runs",
    "",
    "Options:",
    "  --cwd <dir>          Default: current directory.",
    "  --runs-root <dir>    Default: .cf-dw/runs.",
    "  --threshold <rate>   Required per-demo and aggregate cache hit rate. Default: 0.8.",
    "  --output <file>      Write JSON audit result.",
    "  --json               Print JSON instead of text.",
    "  --help               Show help."
  ].join("\n");
}

function renderAudit(audit: ReleaseAudit): string {
  const lines = [
    "CFDW release audit",
    `status: ${audit.passed ? "PASS" : "FAIL"}`,
    `threshold: ${formatRate(audit.threshold)}`,
    "",
    "Project gates:"
  ];

  for (const gate of audit.gates) {
    lines.push(`  ${gate.passed ? "PASS" : "FAIL"} ${gate.name} - ${gate.detail}`);
  }

  lines.push("", "Demo gates:");
  for (const demo of audit.demos) {
    lines.push([
      `  ${demo.passed ? "PASS" : "FAIL"} ${demo.name}`,
      `agents=${demo.agents}`,
      `phases=${demo.phases}`,
      `reasonix=${demo.reasonixAgents}`,
      `artifacts=${demo.artifactAgents}`,
      `transcript_lines=${demo.transcriptLines}`,
      `cache=${formatRate(demo.hitRate)}`
    ].join(" "));
    for (const issue of demo.issues) {
      lines.push(`    - ${issue}`);
    }
  }

  lines.push(
    "",
    [
      "Aggregate:",
      `demos=${audit.aggregate.demos}`,
      `agents=${audit.aggregate.agents}`,
      `reasonix=${audit.aggregate.reasonixAgents}`,
      `artifacts=${audit.aggregate.artifactAgents}`,
      `hit=${audit.aggregate.hitTokens}`,
      `miss=${audit.aggregate.missTokens}`,
      `cache=${formatRate(audit.aggregate.hitRate)}`
    ].join(" "),
    ""
  );

  return `${lines.join("\n")}\n`;
}

function matchLine(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

function formatRate(rate: number | null): string {
  return rate === null ? "n/a" : `${(rate * 100).toFixed(2)}%`;
}

await main();
