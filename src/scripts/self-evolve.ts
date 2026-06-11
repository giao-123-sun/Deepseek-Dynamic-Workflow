#!/usr/bin/env node
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { ensureDir, fileExists, readTextFile, writeTextFile } from "../fs-utils.js";
import { summarizeRunsRoot } from "../report-data.js";
import { stableStringify } from "../stable-json.js";

interface SelfEvolveArgs {
  cwd: string;
  runsRoot: string;
  outputDir: string;
  workflowTag?: string;
  since?: string;
  latestPerAgent: boolean;
  minScore: number;
}

interface CandidateSkill {
  id: string;
  sourceWorkflow: string;
  sourcePhase: string;
  sourceAgent: string;
  sourceRun: string;
  targetAgentPattern: string;
  whenToUse: string;
  skill: string;
  evidence: string;
  suggestedChange: string;
  validationHint: string;
  score: {
    evidenceStrength: number;
    generality: number;
    skillFit: number;
    validationFeasibility: number;
    riskPenalty: number;
    tokenPenalty: number;
    total: number;
  };
  riskTags: string[];
  artifacts: string[];
  metrics: {
    turns: number;
    tools: number;
    tokens: number;
    cacheHitRate: number | null;
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runsRoot = path.resolve(args.cwd, args.runsRoot);
  const outputDir = path.resolve(args.cwd, args.outputDir);
  const runViews = await collectRuns(args, runsRoot);
  const candidates = runViews.map(buildCandidate).filter(Boolean) as CandidateSkill[];
  const promoted = candidates
    .filter((candidate) => candidate.score.total >= args.minScore)
    .sort((a, b) => b.score.total - a.score.total || a.sourceAgent.localeCompare(b.sourceAgent));
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(outputDir, `${stamp}-skill-evolution.md`);
  const jsonPath = path.join(outputDir, `${stamp}-skill-candidates.json`);
  const activePath = path.join(outputDir, "active-skills.md");
  const previousActive = await fileExists(activePath) ? await readTextFile(activePath) : "";

  await ensureDir(outputDir);
  await writeTextFile(jsonPath, `${stableStringify({ generatedAt: now.toISOString(), candidates }, 2)}\n`);
  await writeTextFile(reportPath, renderReport(now.toISOString(), candidates, promoted, args));
  await writeTextFile(activePath, renderActiveSkills(now.toISOString(), promoted, previousActive));

  process.stdout.write(`self_evolve_report=${reportPath}\n`);
  process.stdout.write(`self_evolve_json=${jsonPath}\n`);
  process.stdout.write(`self_evolve_active=${activePath}\n`);
  process.stdout.write(`candidates=${candidates.length} promoted=${promoted.length}\n`);
}

async function collectRuns(args: SelfEvolveArgs, runsRoot: string): Promise<Array<{
  runName: string;
  runDir: string;
  workflow: string;
  phase: string;
  agent: string;
  context: string;
  finalResult: string;
  turns: number;
  tools: number;
  tokens: number;
  cacheHitRate: number | null;
  artifacts: string[];
  mtimeMs: number;
}>> {
  const summaries = await summarizeRunsRoot(runsRoot);
  const sinceMs = args.since ? parseSince(args.since) : undefined;
  const results = [];

  for (const summary of summaries) {
    const sessionPath = path.join(summary.runDir, "session.json");
    if (!(await fileExists(sessionPath))) continue;
    const runStat = await stat(summary.runDir);
    if (sinceMs !== undefined && runStat.mtimeMs < sinceMs) continue;

    const session = JSON.parse(await readTextFile(sessionPath)) as {
      finalResult?: string;
      appendOnlyLog?: Array<Record<string, unknown>>;
    };
    const task = String(session.appendOnlyLog?.find((entry) => entry.kind === "user_task")?.content ?? "");
    const metadata = parseMetadata(task);
    if (args.workflowTag && metadata.workflow !== args.workflowTag) continue;

    const tools = session.appendOnlyLog?.filter((entry) => entry.kind === "tool_result").length ?? 0;
    const artifacts = await collectArtifactPaths(summary.runDir);
    results.push({
      runName: summary.runName,
      runDir: summary.runDir,
      workflow: metadata.workflow ?? "unknown-workflow",
      phase: metadata.phase ?? "unknown-phase",
      agent: metadata.agent ?? summary.runName,
      context: metadata.context ?? task.slice(0, 240),
      finalResult: String(session.finalResult ?? ""),
      turns: summary.turns,
      tools,
      tokens: summary.totalTokens,
      cacheHitRate: summary.hitRate,
      artifacts,
      mtimeMs: runStat.mtimeMs
    });
  }

  const sorted = results.sort((a, b) => a.workflow.localeCompare(b.workflow)
    || a.phase.localeCompare(b.phase)
    || a.agent.localeCompare(b.agent)
    || b.mtimeMs - a.mtimeMs);

  if (!args.latestPerAgent) return sorted;

  const latest = new Map<string, (typeof sorted)[number]>();
  for (const run of sorted) {
    const key = `${run.workflow}\n${run.phase}\n${run.agent}`;
    const previous = latest.get(key);
    if (!previous || run.mtimeMs > previous.mtimeMs) latest.set(key, run);
  }
  return Array.from(latest.values()).sort((a, b) => a.workflow.localeCompare(b.workflow)
    || a.phase.localeCompare(b.phase)
    || a.agent.localeCompare(b.agent));
}

function buildCandidate(run: Awaited<ReturnType<typeof collectRuns>>[number]): CandidateSkill | undefined {
  const evidence = compact(`${run.context}\n\n${run.finalResult}`, 900);
  if (!evidence.trim()) return undefined;

  const evidenceStrength = clampScore((run.tools > 0 ? 1 : 0) + (run.artifacts.length > 0 ? 1 : 0) + (run.turns >= 3 ? 1 : 0), 0, 3);
  const generality = inferGenerality(run);
  const skillFit = run.agent.includes(":") ? 2 : 1;
  const validationFeasibility = run.artifacts.length > 0 ? 2 : run.finalResult.length > 200 ? 1 : 0;
  const riskTags = inferRiskTags(run);
  const riskPenalty = riskTags.length > 0 ? -Math.min(4, riskTags.length * 2) : 0;
  const tokenPenalty = run.finalResult.length > 4000 ? -1 : 0;
  const total = evidenceStrength + generality + skillFit + validationFeasibility + riskPenalty + tokenPenalty;

  return {
    id: stableId(`${run.workflow}:${run.phase}:${run.agent}`),
    sourceWorkflow: run.workflow,
    sourcePhase: run.phase,
    sourceAgent: run.agent,
    sourceRun: run.runName,
    targetAgentPattern: inferTargetPattern(run.agent),
    whenToUse: inferWhenToUse(run),
    skill: inferSkill(run),
    evidence,
    suggestedChange: inferSuggestedChange(run),
    validationHint: inferValidationHint(run),
    score: {
      evidenceStrength,
      generality,
      skillFit,
      validationFeasibility,
      riskPenalty,
      tokenPenalty,
      total
    },
    riskTags,
    artifacts: run.artifacts,
    metrics: {
      turns: run.turns,
      tools: run.tools,
      tokens: run.tokens,
      cacheHitRate: run.cacheHitRate
    }
  };
}

function renderReport(
  generatedAt: string,
  candidates: CandidateSkill[],
  promoted: CandidateSkill[],
  args: SelfEvolveArgs
): string {
  return [
    "# DDW Self-Evolve Skill Report",
    "",
    `Generated: ${generatedAt}`,
    `Scope: ${args.workflowTag ?? "all workflows"}`,
    `Candidates: ${candidates.length}`,
    `Promoted to active context: ${promoted.length}`,
    "",
    "## Method",
    "",
    "This report follows a conservative Hermes-style loop: compact evidence -> scorecard -> candidate procedural skill -> validation hint -> active context.",
    "It does not modify live workflow code. It writes reusable procedural hints into `.cf-dw/self-evolve/active-skills.md`, which future DDW agents read as soft guidance.",
    "",
    "Scorecard: evidence strength 0-3, generality 0-3, skill fit 0-2, validation feasibility 0-2, risk penalty -4-0, token penalty -2-0.",
    "",
    "## Active Skills",
    "",
    ...promoted.flatMap(renderCandidate),
    promoted.length ? "" : "No candidate reached the promotion threshold.",
    "",
    "## All Candidates",
    "",
    ...candidates.flatMap(renderCandidate)
  ].join("\n");
}

function renderActiveSkills(generatedAt: string, promoted: CandidateSkill[], previousActive: string): string {
  const currentBlocks = promoted.slice(0, 24).map((candidate) => activeSkillBlock(candidate));
  const seenSources = new Set(currentBlocks.map(sourceKeyFromBlock).filter(Boolean));
  const previousBlocks = extractPreviousSkillBlocks(previousActive)
    .filter((block) => {
      const key = sourceKeyFromBlock(block);
      if (key && seenSources.has(key)) return false;
      if (key) seenSources.add(key);
      return true;
    })
    .slice(0, Math.max(0, 30 - currentBlocks.length));

  return [
    "# DDW Active Self-Evolved Agent Skills",
    "",
    `Generated: ${generatedAt}`,
    "",
    "Use these as soft procedural hints for future dynamic workflow agents. Re-verify facts and sources.",
    "",
    "## Current Run",
    "",
    ...(currentBlocks.length ? currentBlocks : ["No new promoted skills.", ""]),
    previousBlocks.length ? "## Previous Active Skills" : "",
    previousBlocks.length ? "" : "",
    ...previousBlocks
  ].join("\n");
}

function activeSkillBlock(candidate: CandidateSkill): string {
  return [
    `### ${candidate.targetAgentPattern}`,
    "",
    `- Source: ${candidate.sourceWorkflow} / ${candidate.sourcePhase} / ${candidate.sourceAgent} / ${candidate.sourceRun}`,
    `- When: ${candidate.whenToUse}`,
    `- Skill: ${candidate.skill}`,
    `- Validation: ${candidate.validationHint}`,
    `- Score: ${candidate.score.total}`,
    ""
  ].join("\n");
}

function renderCandidate(candidate: CandidateSkill): string[] {
  return [
    `### ${candidate.sourceAgent}`,
    "",
    `- Source workflow: ${candidate.sourceWorkflow}`,
    `- Source phase: ${candidate.sourcePhase}`,
    `- Source run: ${candidate.sourceRun}`,
    `- Target future agent: ${candidate.targetAgentPattern}`,
    `- When to use: ${candidate.whenToUse}`,
    `- Skill: ${candidate.skill}`,
    `- Suggested change: ${candidate.suggestedChange}`,
    `- Validation hint: ${candidate.validationHint}`,
    `- Score: ${candidate.score.total} (${Object.entries(candidate.score).map(([key, value]) => `${key}=${value}`).join(", ")})`,
    `- Risk tags: ${candidate.riskTags.length ? candidate.riskTags.join(", ") : "none"}`,
    `- Artifacts: ${candidate.artifacts.length ? candidate.artifacts.join(", ") : "none"}`,
    "",
    "Evidence:",
    "",
    `> ${candidate.evidence.replace(/\n/g, "\n> ")}`,
    ""
  ];
}

async function collectArtifactPaths(runDir: string): Promise<string[]> {
  const manifestPath = path.join(runDir, "artifact-manifest.json");
  if (await fileExists(manifestPath)) {
    const manifest = JSON.parse(await readTextFile(manifestPath)) as { artifacts?: Array<{ path?: string }> };
    return (manifest.artifacts ?? []).map((artifact) => artifact.path).filter(Boolean) as string[];
  }

  const artifactDir = path.join(runDir, "artifacts");
  if (!(await fileExists(artifactDir))) return [];
  const entries = await readdir(artifactDir).catch(() => []);
  return entries.map((entry) => path.join(path.basename(runDir), "artifacts", entry).split(path.sep).join("/"));
}

function inferSkill(run: Awaited<ReturnType<typeof collectRuns>>[number]): string {
  const lower = `${run.agent} ${run.context}`.toLowerCase();
  if (lower.includes("research") || lower.includes("source")) {
    return "Collect first-party sources before synthesis, write raw notes to a stable research artifact, and include URLs plus one-line inclusion rationale.";
  }
  if (lower.includes("synthesis") || lower.includes("builder")) {
    return "Before writing the final repo/document, read upstream research artifacts, separate raw notes from curated outputs, and produce both human-readable Markdown and machine-readable JSON.";
  }
  if (lower.includes("review") || lower.includes("audit") || lower.includes("polish")) {
    return "Run a cleanup pass that searches for placeholders, uncited claims, stale metrics, broken structure, and then writes targeted patches plus a residual-risk report.";
  }
  if (lower.includes("publish")) {
    return "Before publishing, verify README, git status, remote URL, commit hash, and repository visibility; report side effects explicitly.";
  }
  return "Turn successful workflow steps into a short reusable checklist, and keep factual claims tied to citations or artifacts.";
}

function inferWhenToUse(run: Awaited<ReturnType<typeof collectRuns>>[number]): string {
  return `When an agent is assigned ${run.context ? `"${compact(run.context, 160)}"` : `a ${run.agent} task`}.`;
}

function inferSuggestedChange(run: Awaited<ReturnType<typeof collectRuns>>[number]): string {
  return `Attach this note to future agents matching ${inferTargetPattern(run.agent)} before they start the same phase.`;
}

function inferValidationHint(run: Awaited<ReturnType<typeof collectRuns>>[number]): string {
  if (run.artifacts.length > 0) {
    return `Check that expected artifacts still exist and are cited: ${run.artifacts.slice(0, 3).join(", ")}.`;
  }
  return "Run a follow-up review agent that checks final output against the task brief.";
}

function inferTargetPattern(agent: string): string {
  const [role, name] = agent.split(":");
  if (role && name) return `${role}:* agents, especially ${agent}`;
  return agent;
}

function inferGenerality(run: Awaited<ReturnType<typeof collectRuns>>[number]): number {
  const text = `${run.agent} ${run.context} ${run.finalResult}`.toLowerCase();
  let score = 1;
  if (/(research|review|synthesis|publish|polish|dashboard|artifact|workflow)/.test(text)) score += 1;
  if (/(source|citation|validate|quality|repo|github|readme|taxonomy|classification)/.test(text)) score += 1;
  return clampScore(score, 0, 3);
}

function inferRiskTags(run: Awaited<ReturnType<typeof collectRuns>>[number]): string[] {
  const text = `${run.context}\n${run.finalResult}`.toLowerCase();
  const tags: string[] = [];
  if (/(api[_ -]?key|secret|password|token=|sk-)/.test(text)) tags.push("secret_risk");
  if (text.length > 12_000) tags.push("too_large");
  return tags;
}

function parseArgs(argv: string[]): SelfEvolveArgs {
  const values = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--help") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (key === "--latest-per-agent") {
      values.set(key.slice(2), true);
      continue;
    }
    const value = argv[i + 1];
    if (!key.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    values.set(key.slice(2), value);
    i += 1;
  }

  const cwd = path.resolve(String(values.get("cwd") ?? process.cwd()));
  return {
    cwd,
    runsRoot: String(values.get("runs-root") ?? ".cf-dw/runs"),
    outputDir: String(values.get("output-dir") ?? ".cf-dw/self-evolve"),
    workflowTag: typeof values.get("workflow-tag") === "string" ? String(values.get("workflow-tag")) : undefined,
    since: typeof values.get("since") === "string" ? String(values.get("since")) : undefined,
    latestPerAgent: Boolean(values.get("latest-per-agent") ?? true),
    minScore: Number(values.get("min-score") ?? 5)
  };
}

function usage(): string {
  return [
    "Usage:",
    "  ddw-self-evolve --workflow-tag <tag> [options]",
    "  cf-dw-self-evolve remains available as a legacy alias.",
    "",
    "Options:",
    "  --cwd <dir>              Default: current directory.",
    "  --runs-root <dir>        Default: .cf-dw/runs.",
    "  --output-dir <dir>       Default: .cf-dw/self-evolve.",
    "  --workflow-tag <tag>     Filter DDW runs by C_FDW_WORKFLOW.",
    "  --since <time>           ISO datetime or relative 30m, 6h, 2d.",
    "  --latest-per-agent       Keep latest run per workflow/phase/agent.",
    "  --min-score <n>          Promotion threshold. Default: 5.",
    "  --help                   Show help."
  ].join("\n");
}

function parseMetadata(task: string): {
  workflow?: string;
  phase?: string;
  agent?: string;
  context?: string;
} {
  return {
    workflow: matchLine(task, "C_FDW_WORKFLOW"),
    phase: matchLine(task, "C_FDW_PHASE"),
    agent: matchLine(task, "C_FDW_AGENT"),
    context: matchLine(task, "C_FDW_CONTEXT")
  };
}

function matchLine(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

function parseSince(value: string): number {
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) return asDate;
  const relative = value.match(/^(\d+)(m|h|d)$/i);
  if (!relative) throw new Error("--since must be an ISO datetime or a relative duration like 30m, 6h, 2d.");
  const amount = Number(relative[1]);
  const unit = relative[2]!.toLowerCase();
  const factor = unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return Date.now() - amount * factor;
}

function compact(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
}

function clampScore(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `skill_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function extractPreviousSkillBlocks(content: string): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  const lines = trimmed.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (/^#{2,3}\s+\d+\.\s+/.test(line) || /^###\s+/.test(line)) {
      if (current.length) blocks.push(current.join("\n").trim());
      current = [line.replace(/^##\s+\d+\.\s+/, "### ")];
      continue;
    }
    if (current.length) {
      if (/^##\s+/.test(line) && !/^##\s+\d+\.\s+/.test(line)) {
        blocks.push(current.join("\n").trim());
        current = [];
        continue;
      }
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join("\n").trim());
  return blocks.filter((block) => block.includes("- Source:"));
}

function sourceKeyFromBlock(block: string): string | undefined {
  return block.match(/^- Source:\s*(.+)$/m)?.[1]?.trim();
}

await main();
