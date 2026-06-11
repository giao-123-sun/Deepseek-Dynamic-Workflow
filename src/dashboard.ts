#!/usr/bin/env node
import path from "node:path";
import { writeTextFile } from "./fs-utils.js";
import {
  loadWorkflowView,
  type WorkflowAgentView,
  type WorkflowPhaseView,
  type WorkflowView
} from "./workflow-view.js";

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
  phases: number;
  completedPhases: number;
  agents: number;
  completed: number;
  running: number;
  failed: number;
  pending: number;
  tokens: number;
  effectiveTokens: number;
  tools: number;
  artifacts: number;
  weightedCacheHitRate: number | null;
  durationMs: number;
}

interface PhaseStats {
  agents: number;
  completed: number;
  running: number;
  failed: number;
  pending: number;
  tokens: number;
  effectiveTokens: number;
  tools: number;
  artifacts: number;
  durationMs: number;
  progress: number;
  weightedCacheHitRate: number | null;
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
    "  ddw-dashboard --runs-root <dir> --output <file>",
    "  ddw-dashboard --workflow-file <file> --output <file>",
    "  cf-dw-dashboard remains available as a legacy alias.",
    "",
    "Options:",
    "  --workflow-file <file>  Workflow visualization JSON.",
    "  --workflow-tag <tag>    Filter run artifacts by C_FDW_WORKFLOW metadata.",
    "  --run-id <id>           Filter by DDW run/session id.",
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
  const progress = ratio(stats.completed, stats.agents);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(workflow.title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --panel-soft: #f2f5f8;
      --text: #17202a;
      --muted: #687382;
      --subtle: #9aa4b2;
      --line: #dfe5ec;
      --completed: #1f9d72;
      --running: #2d6cdf;
      --pending: #a8b1bd;
      --failed: #d34848;
      --cache: #198b67;
      --tool: #7c5cc4;
      --artifact: #b66a25;
      --shadow: 0 12px 28px rgba(31, 42, 55, 0.08);
    }
    * { box-sizing: border-box; }
    html { background: var(--bg); }
    body {
      margin: 0;
      color: var(--text);
      font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      letter-spacing: 0;
    }
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 18px 18px 34px;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 220px;
      gap: 18px;
      align-items: stretch;
      margin-bottom: 16px;
    }
    .hero-main,
    .time-card,
    .metric-card,
    .progress-card,
    .phase-card,
    .rail-item,
    .output-card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }
    .hero-main {
      padding: 20px;
      min-width: 0;
    }
    .eyebrow,
    .section-kicker,
    .chip,
    .metric-label,
    .agent-context,
    .output-path {
      color: var(--muted);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 10px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .icon {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
      flex: 0 0 auto;
    }
    .icon-lg {
      width: 20px;
      height: 20px;
    }
    h1 {
      margin: 0;
      font-size: 28px;
      line-height: 1.1;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .description {
      max-width: 860px;
      margin: 10px 0 0;
      color: #475261;
      font-size: 15px;
      overflow-wrap: anywhere;
    }
    .status-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      padding: 5px 9px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--panel-soft);
      font-size: 12px;
      white-space: nowrap;
    }
    .chip.completed { color: var(--completed); background: #eefaf5; border-color: #cbeede; }
    .chip.running { color: var(--running); background: #edf4ff; border-color: #c9dcff; }
    .chip.failed { color: var(--failed); background: #fff0f0; border-color: #ffd0d0; }
    .time-card {
      padding: 18px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 168px;
    }
    .time-label {
      display: flex;
      align-items: center;
      gap: 7px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .runtime {
      margin-top: 12px;
      font-size: 30px;
      font-weight: 750;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .updated {
      color: var(--subtle);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .overview {
      display: grid;
      grid-template-columns: 1.5fr repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 22px;
    }
    .progress-card {
      grid-row: span 2;
      padding: 16px;
    }
    .progress-head,
    .metric-head,
    .phase-head,
    .output-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .progress-title,
    .section-title,
    .phase-title,
    .output-title {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
    }
    .progress-value {
      font-size: 26px;
      font-weight: 760;
      font-variant-numeric: tabular-nums;
    }
    .progress-track {
      height: 12px;
      margin-top: 16px;
      border-radius: 999px;
      background: #e5ebf1;
      overflow: hidden;
    }
    .progress-track > span {
      display: block;
      height: 100%;
      width: 0;
      border-radius: inherit;
      background: linear-gradient(90deg, #2d6cdf, #1f9d72);
    }
    .status-stack {
      display: flex;
      height: 9px;
      margin-top: 10px;
      overflow: hidden;
      border-radius: 999px;
      background: #e5ebf1;
    }
    .status-segment.completed { background: var(--completed); }
    .status-segment.running { background: var(--running); }
    .status-segment.failed { background: var(--failed); }
    .status-segment.pending { background: var(--pending); }
    .legend {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 14px;
      margin-top: 14px;
      color: var(--muted);
      font-size: 12px;
    }
    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }
    .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 99px;
      flex: 0 0 auto;
    }
    .metric-card {
      min-height: 104px;
      padding: 14px;
    }
    .metric-icon {
      display: inline-flex;
      width: 30px;
      height: 30px;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: var(--panel-soft);
      color: var(--running);
    }
    .metric-value {
      margin-top: 12px;
      font-size: 24px;
      font-weight: 760;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .metric-label {
      margin-top: 5px;
      font-size: 12px;
    }
    .section {
      margin-top: 24px;
    }
    .section-heading {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 14px;
      margin: 0 2px 10px;
    }
    .section-title {
      font-size: 19px;
    }
    .section-kicker {
      margin: 3px 0 0;
      font-size: 13px;
    }
    .phase-rail {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
    }
    .rail-item {
      min-width: 0;
      padding: 11px;
    }
    .rail-name {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
      font-weight: 650;
      color: #293342;
    }
    .rail-name span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rail-meta {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-top: 9px;
      color: var(--muted);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .phase-card {
      margin-bottom: 12px;
      overflow: hidden;
    }
    .phase-card > summary {
      list-style: none;
      cursor: pointer;
      padding: 14px 16px;
    }
    .phase-card > summary::-webkit-details-marker { display: none; }
    .phase-headline {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
    }
    .phase-title-wrap {
      min-width: 0;
    }
    .phase-title {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-wrap: anywhere;
    }
    .phase-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 6px;
      color: var(--muted);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .phase-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
    }
    .chevron {
      transition: transform 160ms ease;
    }
    .phase-card[open] .chevron {
      transform: rotate(90deg);
    }
    .mini-track {
      height: 7px;
      margin-top: 12px;
      border-radius: 999px;
      background: #e7edf3;
      overflow: hidden;
    }
    .mini-track > span {
      display: block;
      height: 100%;
      width: 0;
      border-radius: inherit;
      background: var(--completed);
    }
    .agent-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 10px;
      padding: 0 16px 16px;
    }
    .agent-card {
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcfd;
      padding: 12px;
    }
    .agent-card.running { border-color: #b8cdf7; background: #f5f9ff; }
    .agent-card.failed { border-color: #f2b8b8; background: #fff7f7; }
    .agent-top {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 10px;
    }
    .agent-name {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
      font-weight: 700;
      color: #293342;
    }
    .agent-name span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .agent-context {
      display: -webkit-box;
      margin-top: 7px;
      min-height: 39px;
      overflow: hidden;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      font-size: 13px;
    }
    .agent-bars {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 11px;
    }
    .bar-label {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      color: var(--muted);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
    .thin-track {
      height: 6px;
      margin-top: 5px;
      border-radius: 999px;
      background: #e3e9ef;
      overflow: hidden;
    }
    .thin-track > span {
      display: block;
      height: 100%;
      width: 0;
      border-radius: inherit;
      background: var(--running);
    }
    .thin-track.cache > span { background: var(--cache); }
    .agent-metrics {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 23px;
      padding: 3px 7px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      color: #526071;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .artifact-panel {
      margin-top: 10px;
      border-top: 1px solid var(--line);
      padding-top: 8px;
    }
    .artifact-panel > summary {
      list-style: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      color: #415064;
      font-size: 12px;
      font-weight: 650;
    }
    .artifact-panel > summary::-webkit-details-marker { display: none; }
    .artifact-preview-list {
      display: grid;
      gap: 8px;
      margin-top: 8px;
    }
    .artifact-preview {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 9px;
    }
    .artifact-preview-head {
      display: grid;
      gap: 3px;
      margin-bottom: 7px;
    }
    .artifact-preview-head strong {
      color: #293342;
      font-weight: 700;
    }
    .artifact-preview-path,
    .artifact-preview-meta {
      color: var(--muted);
      font-size: 11px;
      overflow-wrap: anywhere;
    }
    .artifact-preview pre {
      margin: 0;
      max-height: 170px;
      overflow: auto;
      color: #293342;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .artifact-preview-note {
      color: var(--muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .outputs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 10px;
    }
    .output-card {
      min-width: 0;
      padding: 12px;
    }
    .output-title {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
      font-size: 14px;
    }
    .output-title span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .output-preview {
      margin-top: 8px;
      color: #3b4654;
      font-size: 12px;
      display: -webkit-box;
      overflow: hidden;
      -webkit-line-clamp: 5;
      -webkit-box-orient: vertical;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    @media (max-width: 980px) {
      .hero,
      .overview {
        grid-template-columns: 1fr;
      }
      .progress-card {
        grid-row: auto;
      }
      .time-card {
        min-height: 128px;
      }
    }
    @media (max-width: 640px) {
      main { padding: 12px 12px 26px; }
      h1 { font-size: 23px; }
      .runtime { font-size: 24px; }
      .hero-main { padding: 16px; }
      .legend { grid-template-columns: 1fr; }
      .phase-headline { grid-template-columns: 1fr; }
      .phase-actions { justify-content: space-between; }
      .agent-grid { grid-template-columns: 1fr; padding: 0 12px 12px; }
      .agent-bars { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="hero-main">
        <div class="eyebrow">${icon("workflow")} Dynamic workflow monitor</div>
        <h1>${escapeHtml(workflow.title)}</h1>
        <p class="description">${escapeHtml(workflow.description)}</p>
        <div class="status-row">
          ${renderStatusChip(status, labelStatus(String(workflow.status)))}
          <span class="chip">${icon("users")} ${stats.completed}/${stats.agents} agents done</span>
          <span class="chip">${icon("layers")} ${stats.completedPhases}/${stats.phases} phases done</span>
          <span class="chip">${icon("archive")} ${stats.artifacts} outputs</span>
        </div>
      </div>
      <aside class="time-card">
        <div>
          <div class="time-label">${icon("clock")} Runtime</div>
          <div class="runtime" id="runtime" data-start="${escapeAttr(workflow.startedAt ?? "")}" data-end="${escapeAttr(workflow.endedAt ?? "")}" data-duration="${stats.durationMs}">${formatDuration(stats.durationMs)}</div>
        </div>
        <div class="updated">Generated ${escapeHtml(formatDateTime(generatedAt))}</div>
      </aside>
    </section>

    <section class="overview" aria-label="Workflow summary">
      <div class="progress-card">
        <div class="progress-head">
          <div>
            <h2 class="progress-title">Overall progress</h2>
            <div class="section-kicker">Readable at a glance: how much work is finished.</div>
          </div>
          <div class="progress-value">${formatPercent(progress)}</div>
        </div>
        ${renderProgressBar(progress, "progress-track")}
        ${renderStatusSegments(stats)}
        <div class="legend">
          ${renderLegend("completed", stats.completed, "Completed")}
          ${renderLegend("running", stats.running, "Running")}
          ${renderLegend("failed", stats.failed, "Needs attention")}
          ${renderLegend("pending", stats.pending, "Waiting")}
        </div>
      </div>
      ${renderMetricCard("users", "Agents", `${stats.agents}`, `${stats.completed} completed`)}
      ${renderMetricCard("gauge", "Cache hit", formatRate(stats.weightedCacheHitRate), `${formatTokens(stats.effectiveTokens)} effective`)}
      ${renderMetricCard("coins", "Tokens", formatTokens(stats.tokens), `${stats.tools} tool calls`)}
      ${renderMetricCard("layers", "Phases", `${stats.phases}`, `${stats.completedPhases} completed`)}
      ${renderMetricCard("wrench", "Tools", `${stats.tools}`, "actions taken")}
      ${renderMetricCard("archive", "Outputs", `${stats.artifacts}`, "files produced")}
    </section>

    <section class="section">
      <div class="section-heading">
        <div>
          <h2 class="section-title">Workstream</h2>
          <p class="section-kicker">Each block is one phase; the small bar shows how far it has moved.</p>
        </div>
      </div>
      <div class="phase-rail">
        ${workflow.phases.map(renderPhaseRail).join("\n")}
      </div>
    </section>

    <section class="section">
      <div class="section-heading">
        <div>
          <h2 class="section-title">Phases and agents</h2>
          <p class="section-kicker">Open a phase to see what every agent worked on, what it used, and what it produced.</p>
        </div>
      </div>
      ${workflow.phases.map((phase, index) => renderPhase(phase, index === 0 || phase.status === "running")).join("\n")}
    </section>

    ${renderOutputs(workflow)}
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

function renderStatusChip(status: string, label: string): string {
  return `<span class="chip ${escapeAttr(status)}">${statusIcon(status)} ${escapeHtml(label)}</span>`;
}

function renderMetricCard(iconName: string, label: string, value: string, note: string): string {
  return `<article class="metric-card">
  <div class="metric-head">
    <div class="metric-icon">${icon(iconName)}</div>
  </div>
  <div class="metric-value">${escapeHtml(value)}</div>
  <div class="metric-label">${escapeHtml(label)} - ${escapeHtml(note)}</div>
</article>`;
}

function renderProgressBar(value: number, className: string): string {
  return `<div class="${className}"><span style="width:${formatStylePercent(value)}"></span></div>`;
}

function renderStatusSegments(stats: WorkflowStats): string {
  const segments = [
    ["completed", stats.completed],
    ["running", stats.running],
    ["failed", stats.failed],
    ["pending", stats.pending]
  ] as const;
  return `<div class="status-stack" aria-label="Agent status mix">
    ${segments
      .filter(([, count]) => count > 0)
      .map(([name, count]) => `<span class="status-segment ${name}" style="width:${formatStylePercent(ratio(count, stats.agents))}"></span>`)
      .join("")}
  </div>`;
}

function renderLegend(status: string, count: number, label: string): string {
  return `<span class="legend-item"><span class="legend-dot status-segment ${escapeAttr(status)}"></span>${escapeHtml(label)} ${count}</span>`;
}

function renderPhaseRail(phase: WorkflowPhaseView): string {
  const stats = phaseStats(phase);
  return `<article class="rail-item">
  <div class="rail-name">${statusIcon(phase.status)} <span title="${escapeAttr(phase.name)}">${escapeHtml(phase.name)}</span></div>
  ${renderProgressBar(stats.progress, "mini-track")}
  <div class="rail-meta">
    <span>${stats.completed}/${stats.agents} agents</span>
    <span>${formatPercent(stats.progress)}</span>
  </div>
</article>`;
}

function renderPhase(phase: WorkflowPhaseView, open: boolean): string {
  const stats = phaseStats(phase);
  const maxTokens = Math.max(1, ...phase.agents.map((agent) => agent.tokens));
  return `<details class="phase-card" ${open ? "open" : ""}>
  <summary>
    <div class="phase-headline">
      <div class="phase-title-wrap">
        <h3 class="phase-title">${statusIcon(phase.status)} ${escapeHtml(phase.name)}</h3>
        <div class="phase-meta">
          <span>${stats.completed}/${stats.agents} agents complete</span>
          <span>${formatTokens(stats.tokens)} tokens</span>
          <span>${stats.tools} tools</span>
          <span>${stats.artifacts} outputs</span>
          <span>${formatRate(stats.weightedCacheHitRate)} cache</span>
        </div>
      </div>
      <div class="phase-actions">
        <strong>${formatPercent(stats.progress)}</strong>
        ${icon("chevron", "chevron")}
      </div>
    </div>
    ${renderProgressBar(stats.progress, "mini-track")}
  </summary>
  <div class="agent-grid">
    ${phase.agents.map((agent) => renderAgentCard(agent, maxTokens)).join("\n")}
  </div>
</details>`;
}

function renderAgentCard(agent: WorkflowAgentView, maxTokens: number): string {
  const status = normalizeStatus(agent.status);
  const tokenProgress = ratio(agent.tokens, maxTokens);
  const cacheProgress = agent.cacheHitRate ?? 0;
  const artifacts = agent.artifacts ?? [];
  return `<article class="agent-card ${status}">
  <div class="agent-top">
    <div class="agent-name" title="${escapeAttr(agent.name)}">${statusIcon(agent.status)} <span>${escapeHtml(agent.name)}</span></div>
    ${renderStatusChip(status, labelStatus(agent.status))}
  </div>
  <div class="agent-context" title="${escapeAttr(agent.context)}">${escapeHtml(agent.context || "No context captured.")}</div>
  <div class="agent-bars">
    <div>
      <div class="bar-label"><span>Token load</span><span>${agent.tokens > 0 ? formatTokens(agent.tokens) : "n/a"}</span></div>
      ${renderProgressBar(tokenProgress, "thin-track")}
    </div>
    <div>
      <div class="bar-label"><span>Cache reuse</span><span>${formatRate(agent.cacheHitRate)}</span></div>
      ${renderProgressBar(cacheProgress, "thin-track cache")}
    </div>
  </div>
  <div class="agent-metrics">
    ${agent.backend ? `<span class="pill">${icon("cpu")} ${escapeHtml(agent.backend)}</span>` : ""}
    <span class="pill">${icon("wrench")} ${agent.tools} tools</span>
    <span class="pill">${icon("clock")} ${agent.durationMs > 0 ? formatDuration(agent.durationMs) : "n/a"}</span>
    <span class="pill">${icon("coins")} ${agent.effectiveTokens > 0 ? formatTokens(agent.effectiveTokens) : "n/a"} eff</span>
    ${agent.artifact ? `<span class="pill" title="${escapeAttr(agent.artifact)}">${icon("folder")} run</span>` : ""}
    ${artifacts.length > 0 ? `<span class="pill">${icon("archive")} ${artifacts.length} outputs</span>` : ""}
  </div>
  ${renderArtifactPanel(agent)}
</article>`;
}

function renderArtifactPanel(agent: WorkflowAgentView): string {
  const artifacts = agent.artifacts ?? [];
  if (artifacts.length === 0) return "";
  return `<details class="artifact-panel">
  <summary>${icon("file")} Outputs from this agent (${artifacts.length})</summary>
  <div class="artifact-preview-list">
    ${artifacts.map(renderArtifactPreview).join("\n")}
  </div>
</details>`;
}

function renderArtifactPreview(artifact: NonNullable<WorkflowAgentView["artifacts"]>[number]): string {
  const meta = [
    artifact.type,
    artifact.bytes ? formatBytes(artifact.bytes) : "",
    artifact.sha256 ? `sha ${artifact.sha256.slice(0, 10)}` : ""
  ].filter(Boolean).join(" | ");
  const content = artifact.preview
    ? `<pre>${escapeHtml(artifact.preview)}${artifact.previewTruncated ? "\n...[truncated]" : ""}</pre>`
    : `<div class="artifact-preview-note">${escapeHtml(artifact.previewError ?? "No inline preview for this artifact type.")}</div>`;
  return `<section class="artifact-preview">
  <div class="artifact-preview-head">
    <strong>${escapeHtml(artifact.id)}</strong>
    <span class="artifact-preview-meta">${escapeHtml(meta || "file")}</span>
    <span class="artifact-preview-path">${escapeHtml(artifact.path)}</span>
  </div>
  ${content}
</section>`;
}

function renderOutputs(workflow: WorkflowView): string {
  const outputs = allAgents(workflow)
    .flatMap((agent) => (agent.artifacts ?? []).map((artifact) => ({ agent, artifact })))
    .slice(0, 12);
  if (outputs.length === 0) return "";

  return `<section class="section">
  <div class="section-heading">
    <div>
      <h2 class="section-title">Outputs produced</h2>
      <p class="section-kicker">The concrete files this workflow produced, collected in one place.</p>
    </div>
  </div>
  <div class="outputs-grid">
    ${outputs.map(({ agent, artifact }) => renderOutputCard(agent, artifact)).join("\n")}
  </div>
</section>`;
}

function renderOutputCard(
  agent: WorkflowAgentView,
  artifact: NonNullable<WorkflowAgentView["artifacts"]>[number]
): string {
  const preview = artifact.preview
    ? truncate(artifact.preview, 520)
    : artifact.previewError ?? "No preview available.";
  return `<article class="output-card">
  <div class="output-head">
    <h3 class="output-title">${icon("file")} <span title="${escapeAttr(artifact.id)}">${escapeHtml(artifact.id)}</span></h3>
    <span class="pill">${escapeHtml(artifact.type)}</span>
  </div>
  <div class="output-path">${escapeHtml(artifact.path)}</div>
  <div class="output-path">from ${escapeHtml(agent.shortName || agent.name)}</div>
  <div class="output-preview">${escapeHtml(preview)}</div>
</article>`;
}

function workflowStats(workflow: WorkflowView): WorkflowStats {
  const agents = allAgents(workflow);
  const tokens = agents.reduce((sum, agent) => sum + agent.tokens, 0);
  const effectiveTokens = agents.reduce((sum, agent) => sum + agent.effectiveTokens, 0);
  const tools = agents.reduce((sum, agent) => sum + agent.tools, 0);
  const artifacts = agents.reduce((sum, agent) => sum + (agent.artifacts?.length ?? 0), 0);
  const durationMs = workflow.startedAt
    ? Math.max(0, Date.parse(workflow.endedAt ?? new Date().toISOString()) - Date.parse(workflow.startedAt))
    : Math.max(0, ...agents.map((agent) => agent.durationMs));
  const cacheWeighted = weightedCache(agents);

  return {
    phases: workflow.phases.length,
    completedPhases: workflow.phases.filter((phase) => phase.status === "completed").length,
    agents: agents.length,
    completed: agents.filter((agent) => agent.status === "completed").length,
    running: agents.filter((agent) => agent.status === "running").length,
    failed: agents.filter((agent) => agent.status === "failed").length,
    pending: agents.filter((agent) => agent.status === "pending").length,
    tokens,
    effectiveTokens,
    tools,
    artifacts,
    weightedCacheHitRate: cacheWeighted,
    durationMs
  };
}

function phaseStats(phase: WorkflowPhaseView): PhaseStats {
  const agents = phase.agents;
  const tokens = agents.reduce((sum, agent) => sum + agent.tokens, 0);
  const effectiveTokens = agents.reduce((sum, agent) => sum + agent.effectiveTokens, 0);
  const tools = agents.reduce((sum, agent) => sum + agent.tools, 0);
  const artifacts = agents.reduce((sum, agent) => sum + (agent.artifacts?.length ?? 0), 0);
  const durationMs = Math.max(0, ...agents.map((agent) => agent.durationMs));
  const completed = agents.filter((agent) => agent.status === "completed").length;

  return {
    agents: agents.length,
    completed,
    running: agents.filter((agent) => agent.status === "running").length,
    failed: agents.filter((agent) => agent.status === "failed").length,
    pending: agents.filter((agent) => agent.status === "pending").length,
    tokens,
    effectiveTokens,
    tools,
    artifacts,
    durationMs,
    progress: ratio(completed, agents.length),
    weightedCacheHitRate: weightedCache(agents)
  };
}

function allAgents(workflow: WorkflowView): WorkflowAgentView[] {
  return workflow.phases.flatMap((phase) => phase.agents);
}

function weightedCache(agents: WorkflowAgentView[]): number | null {
  const cacheWeighted = agents.reduce(
    (acc, agent) => {
      if (agent.cacheHitRate === null || agent.tokens <= 0) return acc;
      acc.weight += agent.tokens;
      acc.value += agent.tokens * agent.cacheHitRate;
      return acc;
    },
    { value: 0, weight: 0 }
  );
  return cacheWeighted.weight > 0 ? cacheWeighted.value / cacheWeighted.weight : null;
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
  if (normalized === "failed") return "Needs attention";
  return "Waiting";
}

function statusIcon(status: string): string {
  const normalized = normalizeStatus(status);
  if (normalized === "completed") return icon("check");
  if (normalized === "running") return icon("play");
  if (normalized === "failed") return icon("alert");
  return icon("circle");
}

function icon(name: string, className = ""): string {
  const cls = `icon${className ? ` ${className}` : ""}`;
  const paths: Record<string, string> = {
    workflow: '<rect x="3" y="3" width="6" height="6" rx="1"></rect><rect x="15" y="3" width="6" height="6" rx="1"></rect><rect x="9" y="15" width="6" height="6" rx="1"></rect><path d="M9 6h6"></path><path d="M12 9v6"></path>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
    layers: '<path d="m12 2 10 5-10 5L2 7l10-5Z"></path><path d="m2 17 10 5 10-5"></path><path d="m2 12 10 5 10-5"></path>',
    archive: '<rect x="3" y="3" width="18" height="4" rx="1"></rect><path d="M5 7v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7"></path><path d="M10 12h4"></path>',
    clock: '<circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path>',
    gauge: '<path d="M12 14l4-4"></path><path d="M3.34 19a10 10 0 1 1 17.32 0"></path>',
    coins: '<circle cx="8" cy="8" r="6"></circle><path d="M18.09 10.37A6 6 0 1 1 10.34 18"></path><path d="M7 6h1a2 2 0 0 1 0 4H7"></path>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-3-3 2.4-2.4Z"></path>',
    cpu: '<rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><path d="M9 1v3"></path><path d="M15 1v3"></path><path d="M9 20v3"></path><path d="M15 20v3"></path><path d="M20 9h3"></path><path d="M20 15h3"></path><path d="M1 9h3"></path><path d="M1 15h3"></path>',
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"></path>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h5"></path>',
    check: '<path d="M20 6 9 17l-5-5"></path>',
    play: '<path d="m8 5 11 7-11 7Z"></path>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>',
    circle: '<circle cx="12" cy="12" r="9"></circle>',
    chevron: '<path d="m9 18 6-6-6-6"></path>'
  };
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? paths.circle}</svg>`;
}

function ratio(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, value / total));
}

function formatStylePercent(value: number): string {
  return `${Math.max(0, Math.min(100, value * 100)).toFixed(2)}%`;
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
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

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
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
