import { stat } from "node:fs/promises";
import path from "node:path";
import { fileExists, readTextFile } from "./fs-utils.js";
import { summarizeRunsRoot } from "./report-data.js";

export type WorkflowStatus = "pending" | "running" | "completed" | "failed";

export interface WorkflowAgentView {
  id: string;
  name: string;
  shortName: string;
  status: WorkflowStatus;
  backend?: string;
  context: string;
  tokens: number;
  tools: number;
  durationMs: number;
  cacheHitRate: number | null;
  createdAt?: string;
  artifact?: string;
  artifacts?: WorkflowArtifactView[];
}

export interface WorkflowArtifactView {
  id: string;
  type: string;
  path: string;
  bytes?: number;
  sha256?: string;
}

export interface WorkflowPhaseView {
  name: string;
  status: WorkflowStatus;
  agents: WorkflowAgentView[];
}

export interface WorkflowView {
  title: string;
  kind: string;
  status: WorkflowStatus | "Completed" | "Running" | "Failed" | "Pending";
  description: string;
  startedAt?: string;
  endedAt?: string;
  phases: WorkflowPhaseView[];
}

interface RawWorkflowAgent {
  id: string;
  name: string;
  shortName?: string;
  status?: WorkflowStatus;
  context?: string;
  tokens?: number;
  tools?: number;
  durationMs?: number;
  cacheHitRate?: number | null;
  artifact?: string;
}

interface RawWorkflowPhase {
  name: string;
  status?: WorkflowStatus;
  agents?: RawWorkflowAgent[];
}

interface RawWorkflow {
  title?: string;
  kind?: string;
  status?: WorkflowView["status"];
  description?: string;
  startedAt?: string;
  endedAt?: string;
  phases?: RawWorkflowPhase[];
}

export async function loadWorkflowView(options: {
  workflowFile?: string;
  runsRoot: string;
  title: string;
  description: string;
  workflowTag?: string;
  runId?: string;
  since?: string;
  latestPerAgent?: boolean;
}): Promise<WorkflowView> {
  if (options.workflowFile) {
    const raw = JSON.parse(await readTextFile(options.workflowFile)) as RawWorkflow;
    return normalizeWorkflow(raw);
  }

  return buildWorkflowFromRuns(options);
}

async function buildWorkflowFromRuns(options: {
  runsRoot: string;
  title: string;
  description: string;
  workflowTag?: string;
  runId?: string;
  since?: string;
  latestPerAgent?: boolean;
}): Promise<WorkflowView> {
  const { runsRoot, title, description, workflowTag, runId, latestPerAgent } = options;
  const summaries = await summarizeRunsRoot(runsRoot);
  const groups = new Map<string, WorkflowAgentView[]>();
  let inferredTitle = title;
  let inferredDescription = description;
  const sinceMs = options.since ? parseSince(options.since) : undefined;

  for (const summary of summaries) {
    if (runId && summary.runName !== runId) continue;
    const runStat = await stat(summary.runDir);
    if (sinceMs !== undefined && runStat.mtimeMs < sinceMs) continue;

    const sessionPath = path.join(summary.runDir, "session.json");
    const session = (await fileExists(sessionPath))
      ? JSON.parse(await readTextFile(sessionPath)) as {
          sessionId?: string;
          createdAt?: string;
          appendOnlyLog?: Array<Record<string, unknown>>;
          finalResult?: string;
        }
      : {};

    if (runId && session.sessionId && session.sessionId !== runId && summary.runName !== runId) continue;

    const firstTask = session.appendOnlyLog?.find((entry) => entry.kind === "user_task");
    const toolResults = session.appendOnlyLog?.filter((entry) => entry.kind === "tool_result").length ?? 0;
    const context = String(firstTask?.content ?? session.finalResult ?? summary.runName);
    const metadata = parseMetadata(context);
    const manifest = await readArtifactManifest(summary.runDir);

    if (workflowTag && metadata.workflow !== workflowTag) {
      continue;
    }

    if (metadata.workflow && title === "cache-first-dynamic-workflow") {
      inferredTitle = metadata.workflow;
    }
    if (metadata.description && description === "Cache-first dynamic workflow execution.") {
      inferredDescription = metadata.description;
    }

    const agent: WorkflowAgentView = {
      id: summary.runName,
      name: metadata.agent ?? summary.runName,
      shortName: shortenName(metadata.agent ?? summary.runName),
      status: summary.turns > 0 ? "completed" : "pending",
      backend: manifest?.backend,
      context: truncate(metadata.context ?? context, 96),
      tokens: summary.totalTokens,
      tools: toolResults,
      durationMs: summary.latencyMs,
      cacheHitRate: summary.hitRate,
      createdAt: session.createdAt ?? runStat.mtime.toISOString(),
      artifact: path.relative(runsRoot, summary.runDir).split(path.sep).join("/"),
      artifacts: manifest?.artifacts ?? []
    };

    const phase = metadata.phase ?? "Adapter MVP Runs";
    groups.set(phase, [...(groups.get(phase) ?? []), agent]);
  }

  const phases = Array.from(groups.entries()).map(([name, agents]) => {
    const filteredAgents = latestPerAgent ? latestAgents(agents) : agents;
    return {
      name,
      status: filteredAgents.every((agent) => agent.status === "completed") ? "completed" as const : "running" as const,
      agents: filteredAgents
    };
  });

  return {
    title: inferredTitle,
    kind: "Workflow",
    status: phases.every((phase) => phase.status === "completed") ? "completed" : "running",
    description: inferredDescription,
    phases
  };
}

async function readArtifactManifest(runDir: string): Promise<{
  backend?: string;
  artifacts?: WorkflowArtifactView[];
} | undefined> {
  const manifestPath = path.join(runDir, "artifact-manifest.json");
  if (!(await fileExists(manifestPath))) return undefined;
  const raw = JSON.parse(await readTextFile(manifestPath)) as {
    backend?: string;
    artifacts?: Array<{
      id?: string;
      type?: string;
      path?: string;
      bytes?: number;
      sha256?: string;
    }>;
  };

  return {
    backend: raw.backend,
    artifacts: (raw.artifacts ?? [])
      .filter((artifact) => artifact.path)
      .map((artifact) => ({
        id: artifact.id ?? path.basename(String(artifact.path)),
        type: artifact.type ?? "file",
        path: String(artifact.path),
        bytes: artifact.bytes,
        sha256: artifact.sha256
      }))
  };
}

function latestAgents(agents: WorkflowAgentView[]): WorkflowAgentView[] {
  const byName = new Map<string, WorkflowAgentView>();
  for (const agent of agents) {
    const key = agent.name;
    const previous = byName.get(key);
    if (!previous || Date.parse(agent.createdAt ?? "") >= Date.parse(previous.createdAt ?? "")) {
      byName.set(key, agent);
    }
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function parseSince(value: string): number {
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) return asDate;

  const relative = value.match(/^(\d+)(m|h|d)$/i);
  if (!relative) {
    throw new Error("--since must be an ISO datetime or a relative duration like 30m, 6h, 2d.");
  }

  const amount = Number(relative[1]);
  const unit = relative[2]!.toLowerCase();
  const factor = unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return Date.now() - amount * factor;
}

function parseMetadata(task: string): {
  workflow?: string;
  phase?: string;
  agent?: string;
  context?: string;
  description?: string;
} {
  return {
    workflow: matchLine(task, "C_FDW_WORKFLOW"),
    phase: matchLine(task, "C_FDW_PHASE"),
    agent: matchLine(task, "C_FDW_AGENT"),
    context: matchLine(task, "C_FDW_CONTEXT"),
    description: matchLine(task, "C_FDW_DESCRIPTION")
  };
}

function matchLine(text: string, key: string): string | undefined {
  const pattern = new RegExp(`^${key}\\s*:\\s*(.+)$`, "im");
  const match = text.match(pattern);
  return match?.[1]?.trim();
}

function normalizeWorkflow(raw: RawWorkflow): WorkflowView {
  const phases = (raw.phases ?? []).map((phase) => ({
    name: phase.name,
    status: phase.status ?? inferPhaseStatus(phase.agents ?? []),
    agents: (phase.agents ?? []).map((agent) => ({
      id: agent.id,
      name: agent.name,
      shortName: agent.shortName ?? shortenName(agent.name),
      status: agent.status ?? "completed",
      context: agent.context ?? agent.name,
      tokens: agent.tokens ?? 0,
      tools: agent.tools ?? 0,
      durationMs: agent.durationMs ?? 0,
      cacheHitRate: agent.cacheHitRate ?? null,
      artifact: agent.artifact,
      artifacts: []
    }))
  }));

  return {
    title: raw.title ?? "cache-first-dynamic-workflow",
    kind: raw.kind ?? "Workflow",
    status: raw.status ?? inferWorkflowStatus(phases),
    description: raw.description ?? "",
    startedAt: raw.startedAt,
    endedAt: raw.endedAt,
    phases
  };
}

function inferPhaseStatus(agents: RawWorkflowAgent[]): WorkflowStatus {
  if (agents.some((agent) => agent.status === "failed")) return "failed";
  if (agents.some((agent) => agent.status === "running")) return "running";
  if (agents.every((agent) => agent.status === "completed")) return "completed";
  return "pending";
}

function inferWorkflowStatus(phases: WorkflowPhaseView[]): WorkflowStatus {
  if (phases.some((phase) => phase.status === "failed")) return "failed";
  if (phases.some((phase) => phase.status === "running")) return "running";
  if (phases.every((phase) => phase.status === "completed")) return "completed";
  return "pending";
}

function shortenName(name: string): string {
  const parts = name.split(":");
  if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
  return truncate(name, 24);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}
