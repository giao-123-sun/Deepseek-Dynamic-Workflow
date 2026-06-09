#!/usr/bin/env node
import path from "node:path";
import { writeTextFile } from "./fs-utils.js";
import { loadWorkflowView, type WorkflowAgentView, type WorkflowPhaseView, type WorkflowView } from "./workflow-view.js";

interface DashboardArgs {
  runsRoot: string;
  output: string;
  title: string;
  description: string;
  workflowFile?: string;
  workflowTag?: string;
  runId?: string;
  since?: string;
  latestPerAgent: boolean;
}

interface WorkflowStats {
  agents: number;
  completed: number;
  running: number;
  failed: number;
  pending: number;
  tokens: number;
  tools: number;
  weightedCacheHitRate: number | null;
  durationMs: number;
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));
    const workflow = await loadWorkflowView({
      workflowFile: args.workflowFile ? path.resolve(args.workflowFile) : undefined,
      runsRoot: path.resolve(args.runsRoot),
      title: args.title,
      description: args.description,
      workflowTag: args.workflowTag,
      runId: args.runId,
      since: args.since,
      latestPerAgent: args.latestPerAgent
    });

    const output = path.resolve(args.output);
    await writeTextFile(output, renderDashboard(workflow));
    process.stdout.write(`dashboard=${output}\n`);
  } catch (error) {
    process.stderr.write(`[c-fdw-dashboard] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

function parseArgs(argv: string[]): DashboardArgs {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--help") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (key === "--latest-per-agent") {
      values.set(key.slice(2), "true");
      continue;
    }

    const value = argv[i + 1];
    if (!key.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    values.set(key.slice(2), value);
    i += 1;
  }

  return {
    runsRoot: values.get("runs-root") ?? ".cf-dw/runs",
    output: values.get("output") ?? ".cf-dw/reports/dashboard.html",
    title: values.get("title") ?? "cache-first-dynamic-workflow",
    description: values.get("description") ?? "Cache-first dynamic workflow execution.",
    workflowFile: values.get("workflow-file"),
    workflowTag: values.get("workflow-tag"),
    runId: values.get("run-id"),
    since: values.get("since"),
    latestPerAgent: values.get("latest-per-agent") === "true" || values.has("latest-per-agent")
  };
}

function usage(): string {
  return [
    "Usage:",
    "  cf-dw-dashboard --runs-root <dir> --output <file>",
    "  cf-dw-dashboard --workflow-file <file> --output <file>",
    "",
    "Options:",
    "  --workflow-file <file>  Workflow visualization JSON.",
    "  --workflow-tag <tag>    Filter run artifacts by C_FDW_WORKFLOW metadata.",
    "  --run-id <id>           Filter by C-FDW run/session id.",
    "  --since <time>          Filter by run mtime. ISO datetime or relative 30m, 6h, 2d.",
    "  --latest-per-agent      Keep only the latest run for each phase/agent name.",
    "  --runs-root <dir>       Default: .cf-dw/runs",
    "  --output <file>         Default: .cf-dw/reports/dashboard.html",
    "  --title <text>          Fallback title when no workflow file is provided.",
    "  --description <text>    Fallback description.",
    "  --help                  Show help"
  ].join("\n");
}

function renderDashboard(workflow: WorkflowView): string {
  const stats = workflowStats(workflow);
  const generatedAt = new Date().toISOString();
  const status = normalizeStatus(String(workflow.status));

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(workflow.title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f5f5;
      --text: #202124;
      --muted: #80868b;
      --soft: #ececec;
      --soft-2: #e5e5e5;
      --line: #dddddd;
      --done: #9aa0a6;
      --running: #2563eb;
      --pending: #d1d5db;
      --failed: #dc2626;
      --hit: #23815f;
      --miss: #b84a39;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 16px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      letter-spacing: 0;
    }
    main {
      max-width: 1536px;
      margin: 0 auto;
      padding: 0 18px 28px;
    }
    .top {
      position: relative;
      padding: 0 0 18px;
    }
    .title-row {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) auto;
      align-items: start;
      gap: 10px;
      min-height: 34px;
    }
    .status-dot {
      width: 11px;
      height: 11px;
      border-radius: 999px;
      margin-top: 13px;
      background: var(--done);
    }
    .status-dot.running { background: var(--running); }
    .status-dot.failed { background: var(--failed); }
    h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 500;
      line-height: 1.2;
    }
    .runtime {
      color: var(--muted);
      font-size: 24px;
      font-variant-numeric: tabular-nums;
      padding-top: 2px;
      white-space: nowrap;
    }
    .meta-line {
      margin-left: 34px;
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      color: var(--muted);
      font-size: 25px;
      line-height: 1.45;
    }
    .meta-line strong {
      color: #2f3133;
      font-weight: 500;
    }
    .description {
      margin: 22px 18px 0;
      padding: 16px 18px;
      border-radius: 10px;
      background: var(--soft);
      color: #303134;
      font-size: 25px;
      overflow-wrap: anywhere;
    }
    .section-title {
      margin: 48px 36px 12px;
      font-size: 26px;
      font-weight: 600;
    }
    .phase {
      margin: 0 18px 14px;
      border-radius: 8px;
      background: transparent;
    }
    details.phase[open] {
      background: var(--soft);
    }
    summary {
      list-style: none;
      cursor: pointer;
      padding: 12px 16px;
      min-height: 54px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
    }
    summary::-webkit-details-marker { display: none; }
    .phase:not([open]) summary {
      padding-top: 16px;
      padding-bottom: 14px;
    }
    .phase-name {
      font-size: 25px;
      color: #3b3d40;
      overflow-wrap: anywhere;
    }
    .chevron {
      color: #a9abad;
      font-size: 30px;
      line-height: 1;
      transform: rotate(0deg);
      transition: transform 140ms ease;
    }
    details[open] .chevron {
      transform: rotate(90deg);
    }
    .agent-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 0 16px 16px;
      max-width: 660px;
    }
    .agent-dot {
      position: relative;
      width: 12px;
      height: 12px;
      border-radius: 4px;
      background: var(--done);
      flex: 0 0 auto;
    }
    .agent-dot.running { background: var(--running); }
    .agent-dot.pending { background: var(--pending); }
    .agent-dot.failed { background: var(--failed); }
    .agent-dot::after {
      content: attr(data-tip);
      position: absolute;
      left: 50%;
      bottom: calc(100% + 8px);
      transform: translateX(-50%);
      width: max-content;
      max-width: 320px;
      padding: 8px 10px;
      border-radius: 8px;
      background: #242628;
      color: #fff;
      font-size: 13px;
      line-height: 1.35;
      opacity: 0;
      pointer-events: none;
      white-space: normal;
      z-index: 10;
    }
    .agent-dot:hover::after { opacity: 1; }
    .phase-body {
      padding: 0 16px 18px;
    }
    .agent-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      color: var(--muted);
      font-size: 25px;
      font-variant-numeric: tabular-nums;
    }
    .agent-table th {
      color: #b7b9bb;
      font-weight: 400;
      text-align: right;
      padding: 0 8px 5px;
      white-space: nowrap;
    }
    .agent-table th:first-child,
    .agent-table td:first-child {
      text-align: left;
      width: auto;
    }
    .agent-table th:nth-child(2),
    .agent-table td:nth-child(2) {
      width: 120px;
    }
    .agent-table th:nth-child(3),
    .agent-table td:nth-child(3) {
      width: 90px;
    }
    .agent-table th:nth-child(4),
    .agent-table td:nth-child(4) {
      width: 116px;
    }
    .agent-table th:nth-child(5),
    .agent-table td:nth-child(5) {
      width: 130px;
    }
    .agent-table td {
      padding: 2px 8px;
      vertical-align: top;
      text-align: right;
      white-space: nowrap;
    }
    .agent-name {
      color: #7a7d80;
      max-width: min(900px, calc(100vw - 620px));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .agent-context {
      display: block;
      max-width: min(900px, calc(100vw - 620px));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #9b9da0;
      font-size: 13px;
    }
    .cache-cell {
      min-width: 96px;
    }
    .cache-bar {
      width: 72px;
      height: 7px;
      margin: 9px 0 0 auto;
      border-radius: 999px;
      overflow: hidden;
      background: #d8d8d8;
    }
    .cache-bar span {
      display: block;
      height: 100%;
      background: var(--hit);
    }
    .artifact {
      color: #8d8f91;
      font-size: 13px;
    }
    .agent-extra {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
      max-width: min(900px, calc(100vw - 620px));
    }
    .backend {
      display: inline-flex;
      align-items: center;
      min-height: 18px;
      padding: 1px 7px;
      border: 1px solid #d6d6d6;
      border-radius: 999px;
      color: #606368;
      background: #f7f7f7;
      font-size: 12px;
      white-space: nowrap;
    }
    .artifact-chip {
      display: inline-flex;
      align-items: center;
      max-width: 220px;
      min-height: 18px;
      padding: 1px 7px;
      border: 1px solid #d6d6d6;
      border-radius: 999px;
      color: #606368;
      background: #fff;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    @media (max-width: 860px) {
      main { padding: 8px 12px 24px; }
      h1 { font-size: 22px; }
      .runtime { font-size: 18px; }
      .meta-line {
        margin-left: 28px;
        font-size: 18px;
        gap: 10px;
      }
      .description {
        margin: 16px 0 0;
        font-size: 18px;
      }
      .section-title {
        margin: 32px 0 10px;
        font-size: 22px;
      }
      .phase { margin-left: 0; margin-right: 0; }
      .phase-name { font-size: 20px; }
      .agent-table {
        display: block;
        overflow-x: auto;
        font-size: 17px;
      }
      .agent-name,
      .agent-context {
        max-width: 420px;
      }
    }
  </style>
</head>
<body>
  <main>
    <section class="top">
      <div class="title-row">
        <span class="status-dot ${status}"></span>
        <h1>${escapeHtml(workflow.title)}</h1>
        <div class="runtime" id="runtime" data-start="${escapeAttr(workflow.startedAt ?? "")}" data-end="${escapeAttr(workflow.endedAt ?? "")}" data-duration="${stats.durationMs}">${formatDuration(stats.durationMs)}</div>
      </div>
      <div class="meta-line">
        <span>${escapeHtml(workflow.kind)}</span>
        <span>${escapeHtml(labelStatus(String(workflow.status)))}</span>
      </div>
      <div class="meta-line">
        <span><strong>${stats.agents}</strong> Agents</span>
        <span><strong>${formatTokens(stats.tokens)}</strong> Tokens</span>
        <span><strong>${stats.running}</strong> Running</span>
        <span><strong>${formatRate(stats.weightedCacheHitRate)}</strong> Cache</span>
      </div>
      <div class="description">${escapeHtml(workflow.description)}</div>
    </section>

    <h2 class="section-title">Phases</h2>
    ${workflow.phases.map((phase, index) => renderPhase(phase, index === 0 || phase.status === "running")).join("\n")}
  </main>
  <script>
    const runtime = document.getElementById('runtime');
    if (runtime && runtime.dataset.start && !runtime.dataset.end) {
      const start = Date.parse(runtime.dataset.start);
      if (!Number.isNaN(start)) {
        const tick = () => {
          const ms = Date.now() - start;
          runtime.textContent = formatDuration(ms);
        };
        const formatDuration = (ms) => {
          const total = Math.max(0, Math.round(ms / 1000));
          const hours = Math.floor(total / 3600);
          const minutes = Math.floor((total % 3600) / 60);
          const seconds = total % 60;
          return hours > 0 ? hours + 'h ' + minutes + 'm ' + seconds + 's' : minutes + 'm ' + seconds + 's';
        };
        tick();
        setInterval(tick, 1000);
      }
    }
    document.documentElement.dataset.generatedAt = ${JSON.stringify(generatedAt)};
  </script>
</body>
</html>`;
}

function renderPhase(phase: WorkflowPhaseView, open: boolean): string {
  const agents = phase.agents;
  return `<details class="phase" ${open ? "open" : ""}>
  <summary>
    <div>
      <div class="phase-name">${escapeHtml(phase.name)}</div>
    </div>
    <span class="chevron">›</span>
  </summary>
  <div class="agent-grid" aria-label="${escapeAttr(phase.name)} agents">
    ${agents.map(renderAgentDot).join("\n")}
  </div>
  <div class="phase-body">
    ${agents.length === 0 ? "" : renderAgentTable(agents)}
  </div>
</details>`;
}

function renderAgentDot(agent: WorkflowAgentView): string {
  const tip = `${agent.shortName}: ${truncate(agent.context, 48)}`;
  return `<span class="agent-dot ${normalizeStatus(agent.status)}" title="${escapeAttr(tip)}" data-tip="${escapeAttr(tip)}"></span>`;
}

function renderAgentTable(agents: WorkflowAgentView[]): string {
  return `<table class="agent-table">
  <thead>
    <tr>
      <th>Agent</th>
      <th>Tokens</th>
      <th>Tools</th>
      <th>Cache</th>
      <th>Time</th>
    </tr>
  </thead>
  <tbody>
    ${agents.map(renderAgentRow).join("\n")}
  </tbody>
</table>`;
}

function renderAgentRow(agent: WorkflowAgentView): string {
  const cachePct = agent.cacheHitRate === null ? 0 : Math.max(0, Math.min(100, agent.cacheHitRate * 100));
  return `<tr>
  <td>
    <div class="agent-name" title="${escapeAttr(agent.name)}">${escapeHtml(agent.name)}</div>
    <span class="agent-context">${escapeHtml(truncate(agent.context, 88))}</span>
    ${agent.artifact ? `<span class="artifact">${escapeHtml(agent.artifact)}</span>` : ""}
    ${renderAgentExtras(agent)}
  </td>
  <td>${agent.tokens > 0 ? formatTokens(agent.tokens) : ""}</td>
  <td>${agent.tools > 0 ? agent.tools : ""}</td>
  <td class="cache-cell">
    ${agent.cacheHitRate === null ? "" : formatRate(agent.cacheHitRate)}
    <div class="cache-bar"><span style="width:${cachePct.toFixed(2)}%"></span></div>
  </td>
  <td>${agent.durationMs > 0 ? formatDuration(agent.durationMs) : ""}</td>
</tr>`;
}

function renderAgentExtras(agent: WorkflowAgentView): string {
  const chips: string[] = [];
  if (agent.backend) {
    chips.push(`<span class="backend">${escapeHtml(agent.backend)}</span>`);
  }
  for (const artifact of (agent.artifacts ?? []).slice(0, 4)) {
    const label = `${artifact.id}:${artifact.type}${artifact.bytes ? ` ${formatBytes(artifact.bytes)}` : ""}`;
    chips.push(`<span class="artifact-chip" title="${escapeAttr(artifact.path)}">${escapeHtml(label)}</span>`);
  }
  const remaining = Math.max(0, (agent.artifacts?.length ?? 0) - 4);
  if (remaining > 0) {
    chips.push(`<span class="artifact-chip">+${remaining} files</span>`);
  }
  return chips.length ? `<div class="agent-extra">${chips.join("")}</div>` : "";
}

function workflowStats(workflow: WorkflowView): WorkflowStats {
  const agents = workflow.phases.flatMap((phase) => phase.agents);
  const tokens = agents.reduce((sum, agent) => sum + agent.tokens, 0);
  const tools = agents.reduce((sum, agent) => sum + agent.tools, 0);
  const durationMs = workflow.startedAt
    ? Math.max(0, Date.parse(workflow.endedAt ?? new Date().toISOString()) - Date.parse(workflow.startedAt))
    : Math.max(0, ...agents.map((agent) => agent.durationMs));

  const cacheWeighted = agents.reduce(
    (acc, agent) => {
      if (agent.cacheHitRate === null || agent.tokens <= 0) return acc;
      acc.weight += agent.tokens;
      acc.value += agent.tokens * agent.cacheHitRate;
      return acc;
    },
    { value: 0, weight: 0 }
  );

  return {
    agents: agents.length,
    completed: agents.filter((agent) => agent.status === "completed").length,
    running: agents.filter((agent) => agent.status === "running").length,
    failed: agents.filter((agent) => agent.status === "failed").length,
    pending: agents.filter((agent) => agent.status === "pending").length,
    tokens,
    tools,
    weightedCacheHitRate: cacheWeighted.weight > 0 ? cacheWeighted.value / cacheWeighted.weight : null,
    durationMs
  };
}

function normalizeStatus(status: string): string {
  const value = status.toLowerCase();
  if (value === "completed") return "completed";
  if (value === "running") return "running";
  if (value === "failed") return "failed";
  return "pending";
}

function labelStatus(status: string): string {
  const normalized = normalizeStatus(status);
  if (normalized === "completed") return "Completed";
  if (normalized === "running") return "Running";
  if (normalized === "failed") return "Failed";
  return "Pending";
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${trimNumber(value / 1_000_000)}M`;
  if (value >= 1_000) return `${trimNumber(value / 1_000)}k`;
  return String(value);
}

function trimNumber(value: number): string {
  return value >= 10 ? value.toFixed(1).replace(/\.0$/, "") : value.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatRate(rate: number | null): string {
  return rate === null ? "n/a" : `${(rate * 100).toFixed(1)}%`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${trimNumber(bytes / 1_000_000)}MB`;
  if (bytes >= 1_000) return `${trimNumber(bytes / 1_000)}KB`;
  return `${bytes}B`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

await main();
