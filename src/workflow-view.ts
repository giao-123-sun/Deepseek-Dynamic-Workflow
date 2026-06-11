import { readFile, stat } from "node:fs/promises";
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
  effectiveTokens: number;
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
  mediaKind?: "image" | "video";
  mediaSrc?: string;
  preview?: string;
  previewTruncated?: boolean;
  previewError?: string;
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
  effectiveTokens?: number;
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
          cwd?: string;
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
    const artifactRoot = session.cwd ? path.resolve(session.cwd) : inferArtifactRoot(runsRoot);
    const manifest = await readArtifactManifest(summary.runDir, artifactRoot);
    const writtenArtifacts = await collectWrittenArtifacts(session.appendOnlyLog ?? [], artifactRoot);
    const artifacts = mergeArtifacts([...(manifest?.artifacts ?? []), ...writtenArtifacts]);

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
      effectiveTokens: summary.effectiveTokens,
      tools: toolResults,
      durationMs: summary.latencyMs,
      cacheHitRate: summary.hitRate,
      createdAt: session.createdAt ?? runStat.mtime.toISOString(),
      artifact: path.relative(runsRoot, summary.runDir).split(path.sep).join("/"),
      artifacts
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

async function collectWrittenArtifacts(
  log: Array<Record<string, unknown>>,
  artifactRoot: string
): Promise<WorkflowArtifactView[]> {
  const artifacts: WorkflowArtifactView[] = [];
  for (const entry of log) {
    if (entry.kind !== "tool_result") continue;
    const result = entry.result as {
      tool?: string;
      status?: string;
      args?: Record<string, unknown>;
      content_sha256?: string;
    } | undefined;
    if (!result || result.tool !== "write_file" || result.status !== "ok") continue;
    const artifactPath = typeof result.args?.path === "string" ? result.args.path : "";
    if (!artifactPath) continue;
    const artifact: WorkflowArtifactView = {
      id: path.basename(artifactPath),
      type: inferArtifactType(artifactPath),
      path: artifactPath,
      bytes: typeof result.args?.bytes === "number" ? result.args.bytes : undefined,
      sha256: result.content_sha256
    };
    artifacts.push(await addArtifactPreview(artifact, artifactRoot));
  }
  return artifacts;
}

function mergeArtifacts(artifacts: WorkflowArtifactView[]): WorkflowArtifactView[] {
  const seen = new Set<string>();
  const merged: WorkflowArtifactView[] = [];
  for (const artifact of artifacts) {
    if (seen.has(artifact.path)) continue;
    seen.add(artifact.path);
    merged.push(artifact);
  }
  return merged;
}

function inferArtifactType(artifactPath: string): string {
  const extension = path.extname(artifactPath).toLowerCase();
  if (extension === ".md") return "markdown";
  if (extension === ".json") return "json";
  if (extension === ".html") return "html";
  if (extension === ".txt") return "text";
  if (extension === ".csv") return "csv";
  if ([".gif", ".png", ".jpg", ".jpeg", ".webp"].includes(extension)) return "image";
  if ([".mp4", ".webm", ".mov"].includes(extension)) return "video";
  return "file";
}

async function readArtifactManifest(runDir: string, artifactRoot: string): Promise<{
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
    artifacts: await Promise.all((raw.artifacts ?? [])
      .filter((artifact) => artifact.path)
      .map(async (artifact) => {
        const view: WorkflowArtifactView = {
          id: artifact.id ?? path.basename(String(artifact.path)),
          type: artifact.type ?? "file",
          path: String(artifact.path),
          bytes: artifact.bytes,
          sha256: artifact.sha256
        };
        return addArtifactPreview(view, artifactRoot);
      }))
  };
}

async function addArtifactPreview(
  artifact: WorkflowArtifactView,
  artifactRoot: string
): Promise<WorkflowArtifactView> {
  const resolved = resolveWorkspacePath(artifactRoot, artifact.path);
  if (!resolved) {
    return {
      ...artifact,
      previewError: "Preview skipped: artifact path escapes workspace."
    };
  }

  if (!isPreviewableArtifact(artifact)) {
    return artifact;
  }

  if (!(await fileExists(resolved))) {
    return {
      ...artifact,
      previewError: "Preview skipped: artifact file is missing."
    };
  }

  const fileStat = await stat(resolved);
  const bytes = artifact.bytes ?? fileStat.size;
  const mediaKind = inferMediaKind(artifact);
  if (mediaKind) {
    const maxMediaBytes = 1_800_000;
    if (fileStat.size > maxMediaBytes) {
      return {
        ...artifact,
        bytes,
        mediaKind,
        previewError: `Media preview skipped: file is larger than ${maxMediaBytes} bytes.`
      };
    }

    try {
      const raw = await readFile(resolved);
      return {
        ...artifact,
        bytes,
        mediaKind,
        mediaSrc: `data:${mediaMimeType(artifact.path, mediaKind)};base64,${raw.toString("base64")}`
      };
    } catch (error) {
      return {
        ...artifact,
        bytes,
        mediaKind,
        previewError: `Media preview skipped: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  const maxPreviewBytes = 80_000;
  if (fileStat.size > maxPreviewBytes) {
    return {
      ...artifact,
      bytes,
      previewError: `Preview skipped: file is larger than ${maxPreviewBytes} bytes.`
    };
  }

  try {
    const raw = await readTextFile(resolved);
    const preview = normalizeArtifactPreview(raw, artifact.type, artifact.path);
    const maxPreviewChars = 2_400;
    return {
      ...artifact,
      bytes,
      preview: preview.length > maxPreviewChars ? preview.slice(0, maxPreviewChars) : preview,
      previewTruncated: preview.length > maxPreviewChars
    };
  } catch (error) {
    return {
      ...artifact,
      bytes,
      previewError: `Preview skipped: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

function resolveWorkspacePath(cwd: string, inputPath: string): string | undefined {
  const resolved = path.resolve(cwd, inputPath);
  const relative = path.relative(cwd, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  return resolved;
}

function isPreviewableArtifact(artifact: WorkflowArtifactView): boolean {
  const type = artifact.type.toLowerCase();
  const ext = path.extname(artifact.path).toLowerCase();
  return ["text", "markdown", "json", "jsonl", "csv", "log"].includes(type)
    || [".txt", ".md", ".json", ".jsonl", ".csv", ".log"].includes(ext);
}

function inferMediaKind(artifact: WorkflowArtifactView): "image" | "video" | undefined {
  const type = artifact.type.toLowerCase();
  const ext = path.extname(artifact.path).toLowerCase();
  if (type === "image" || ["gif", "png", "jpg", "jpeg", "webp"].includes(type) || [".gif", ".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    return "image";
  }
  if (type === "video" || ["mp4", "webm", "mov"].includes(type) || [".mp4", ".webm", ".mov"].includes(ext)) {
    return "video";
  }
  return undefined;
}

function mediaMimeType(filePath: string, mediaKind: "image" | "video"): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".gif") return "image/gif";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  return mediaKind === "image" ? "image/png" : "video/mp4";
}

function normalizeArtifactPreview(raw: string, type: string, filePath: string): string {
  const lowerType = type.toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  if (lowerType === "json" || ext === ".json") {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
  return raw;
}

function inferArtifactRoot(runsRoot: string): string {
  const normalized = path.resolve(runsRoot);
  if (path.basename(normalized) === "runs" && path.basename(path.dirname(normalized)) === ".cf-dw") {
    return path.dirname(path.dirname(normalized));
  }
  return process.cwd();
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
      effectiveTokens: agent.effectiveTokens ?? agent.tokens ?? 0,
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
