# Affordable Dynamic Workflow

[![CI](https://github.com/giao-123-sun/cf-dw/actions/workflows/ci.yml/badge.svg)](https://github.com/giao-123-sun/cf-dw/actions/workflows/ci.yml)
[![Release Source](https://github.com/giao-123-sun/cf-dw/actions/workflows/release-source.yml/badge.svg)](https://github.com/giao-123-sun/cf-dw/actions/workflows/release-source.yml)
![License](https://img.shields.io/badge/license-non--commercial_source--available-blue)
![Cache First](https://img.shields.io/badge/design-cache--first-2ea44f)
![DeepSeek](https://img.shields.io/badge/runtime-DeepSeek_prefix_cache-black)

![Affordable Dynamic Workflow banner](assets/cf-dw-hero.png)

**Affordable Dynamic Workflow (ADW)** is a cache-first harness for running
dynamic multi-agent workflows without turning every serious run into an
expensive experiment.

ADW connects Open Dynamic Workflows style orchestration, DeepSeek prompt-cache
affinity, stable Repomix prefixes, Native C-FDW workers, ReasoniX harness
workers, run artifacts, and a workflow dashboard.

> Current package and CLI commands still use the historical `cf-dw-*` name.
> `CFDW` means Cache-First Dynamic Workflows. `ADW` is the public-facing project
> name: Affordable Dynamic Workflow.

> License note: ADW is source-available for non-commercial use only. Commercial
> use requires a separate written license. See [LICENSE.md](./LICENSE.md) and
> [NOTICE.md](./NOTICE.md).

## Why ADW

动态工作流已经证明了它在智能体编排上的效率：复杂任务可以被拆成多个阶段，让多个 agent 并行探索、交叉验证、传递产物，并最终形成更高质量的结果。随着动态工作流技术走向开源，这种能力也应该继续流动，让更多开发者、研究者和团队能够使用、理解和改进它。

ADW 的定位很直接：**把动态工作流做得更可负担**。很多真实场景里，成本是限制 multi-agent workflow 普及的关键因素；而 DeepSeek 的高缓存命中机制、低价格和稳定性能，给了我们一个新的工程机会：通过 cache-first 的设计，把动态工作流的运行成本显著降下来，同时保留并行智能体带来的效率和质量。

Dynamic workflows are powerful because they let many agents search, analyze,
verify, and synthesize in parallel. ADW makes that pattern practical by adding a
cache-stable runtime layer, measurable prompt-cache usage, artifact handoff, and
workflow observability.

## At A Glance

| Capability | What ADW provides |
|---|---|
| Dynamic workflow adapter | Run ODW-style `agent()` calls through observable C-FDW sessions. |
| Cache-first execution | Reuse stable Repomix prefixes and measure DeepSeek cache hits per run. |
| Runtime choice | Use Native C-FDW for lightweight agents or ReasoniX for autonomous multi-step agents. |
| Artifact handoff | Persist transcripts, JSON results, summaries, manifests, and downstream evidence. |
| Dashboard | Inspect phases, agents, tokens, tools, cache hit rate, time, and artifacts. |
| Demo suite | Five practical demos covering ROI, code audit, policy/legal mining, city research, and Web/CDP evidence extraction. |

Verified release-demo metrics:

```text
demo workflows  = 5
agents          = 23
reasonix agents = 20
cache hit       = 202,880 tokens
cache miss      = 27,142 tokens
hit rate        = 88.20%
```

See [docs/demo-benchmark-report-cn.md](./docs/demo-benchmark-report-cn.md) and
[docs/token-efficiency-playbook-cn.md](./docs/token-efficiency-playbook-cn.md).

## How It Works

One workflow `agent()` becomes a cache-stable, observable agent run:

```text
ODW agent(prompt)
-> ADW / C-FDW adapter
-> Native AgentSession or ReasoniX harness
-> DeepSeek-compatible model call
-> usage ledger + transcript + artifacts
-> workflow dashboard
```

ADW is built for workflows where many agents work across phases, reuse a stable
prefix, hand off structured artifacts, and expose real cache-hit metrics.

## Architecture

![Affordable Dynamic Workflow architecture](assets/cf-dw-architecture.png)

```mermaid
flowchart LR
  Author["Workflow Author"] --> ODW["Open Dynamic Workflows"]
  ODW --> Phase["phase / parallel / pipeline"]
  Phase --> Adapter["ADW / C-FDW Adapter"]
  Adapter --> Router["Backend Router"]
  Router --> Native["Native C-FDW AgentSession"]
  Router --> RX["ReasoniX Harness Agent"]
  Native --> DS["DeepSeek API"]
  RX --> DS
  Prefix["Repomix Stable Prefix"] --> Native
  Prefix --> RX
  DS --> Usage["Usage Ledger"]
  RX --> Transcript["ReasoniX Transcript"]
  Native --> Artifacts["Run Artifacts"]
  RX --> Artifacts
  Usage --> Dashboard["Workflow Dashboard"]
  Transcript --> Usage
  Artifacts --> Dashboard
```

## Quick Start

Install and build:

```bash
npm install
npm run build
npm run check
```

Create a local `.env`:

```text
DEEPSEEK_API_KEY=...
```

`.env`, transcripts, run artifacts, logs, dashboards, and local reports are
ignored by git.

## Run One Agent

Native C-FDW is best for cheap, controlled, lightweight agents such as
classification, summary, tagging, simple JSON conversion, and read-only file
inspection.

```bash
node dist/index.js `
  --cwd . `
  --prompt "List the top-level files and summarize the project." `
  --cache-group-id adw_local_probe_v1 `
  --session-id agent_001 `
  --max-turns 4
```

## Run One ReasoniX Harness Agent

ReasoniX is best for more autonomous, multi-step agents: codebase analysis,
multi-tool phase work, future CDP/browser workflows, and high-value synthesis.

```bash
node dist/reasonix-agent.js `
  --cwd . `
  --prompt "Inspect README.md and explain what ADW does." `
  --cache-group-id adw_reasonix_probe_v1 `
  --session-id auto `
  --model deepseek-v4-flash `
  --effort low `
  --budget 0.04 `
  --no-proxy
```

Current wrapper behavior:

```text
one ODW agent = one ReasoniX run = one transcript = one C-FDW session
```

## Build A Stable Prefix

```bash
node dist/prefix-cli.js `
  --cwd . `
  --output .cf-dw/prefix/cache-prefix.xml `
  --style xml `
  --include "src/**/*.ts,README.md,package.json,odw*.json,examples/**/*.js,examples/**/*.json,examples/**/*.md" `
  --compress
```

Use the prefix with the Native agent:

```bash
node dist/index.js `
  --cwd . `
  --prompt-file ./examples/prompts/workspace-summary.md `
  --prefix-file ./.cf-dw/prefix/cache-prefix.xml `
  --cache-group-id adw_workspace_v1 `
  --session-id agent_workspace_001
```

## Run With ODW

Native backend:

```bash
node ../open-dynamic-workflows/dist/cli.js run ./examples/odw-real-demo.js `
  --config ./odw.config.json `
  --runs-root ./.odw/runs `
  --wait `
  --timeout 1200
```

ReasoniX backend:

```bash
node ../open-dynamic-workflows/dist/cli.js run ./examples/odw-reasonix-demo.js `
  --config ./odw.reasonix.config.json `
  --runs-root ./.odw/runs `
  --wait `
  --timeout 900
```

## Dashboard

Generate from a workflow JSON fixture:

```bash
node dist/dashboard.js `
  --workflow-file ./examples/workflows/lexfodra-round3-demo.json `
  --output ./.cf-dw/reports/workflow-dashboard.html
```

Generate from real run artifacts:

```bash
node dist/dashboard.js `
  --runs-root ./.cf-dw/runs `
  --workflow-tag reasonix-odw-demo `
  --latest-per-agent `
  --output ./.cf-dw/reports/reasonix-odw-demo-dashboard.html
```

The dashboard shows:

- workflow title, status, duration, total tokens, total agents;
- phase rows with agent squares and hover context;
- per-agent tokens, tools, cache hit rate, runtime, backend, and artifact path;
- artifact chips and expandable previews from `artifact-manifest.json`;
- optional filtering with `--run-id`, `--since`, and `--latest-per-agent`;
- effective token totals using cache-read, cache-miss, and output weights.

## Demo Suite

The release target is five practical demos:

| Demo | Backend | Purpose | Metric |
|---|---|---|---|
| [Cache ROI Benchmark](./examples/demos/cache-roi-benchmark.js) | Native + ReasoniX | Run a stable workflow shape and define cold/warm cache gates. | 90.67% cache hit |
| [Codebase Architecture Audit](./examples/demos/codebase-architecture-audit.js) | Native + ReasoniX | Parallel agents inspect modules and synthesize a release report. | 88.42% cache hit |
| [Policy / Legal Conflict Mining](./examples/demos/policy-conflict-mining.js) | ReasoniX | Multi-phase rule extraction, comparison, and conflict scoring. | 88.79% cache hit |
| [Multi-City Deep Research](./examples/demos/multi-city-deep-research.js) | ReasoniX | City/domain fan-out, normalization, comparison, and report outline. | 85.16% cache hit |
| [Web/CDP Evidence Extraction](./examples/demos/web-cdp-evidence-extraction.js) | ReasoniX, CDP-ready | Browser evidence playbooks and future CDP artifact protocol. | 85.86% cache hit |

The current Web/CDP demo defines and tests the workflow shape and artifact
protocol. Live CDP browser control is planned for the next implementation stage.

Run the demo suite manually:

```bash
npm run demo:run
```

Regenerate latest-per-agent dashboards without running live demos:

```bash
npm run demo:dashboards
```

Verify release gates from local files and real run artifacts:

```bash
npm run release:audit
```

Create a source release archive from committed `HEAD`:

```bash
npm run release:pack
```

The archive is written under `.cf-dw/release/` and excludes local secrets,
runtime logs, dashboards, `dist/`, and dependencies.

## Run Artifacts

Each Native C-FDW agent writes under:

```text
<cwd>/.cf-dw/runs/<session_id>/
  session.json
  usage.jsonl
```

Each ReasoniX harness agent writes the same observable run envelope plus
artifact-aware handoff files:

```text
<cwd>/.cf-dw/runs/<session_id>/
  session.json
  usage.jsonl
  reasonix-transcript.jsonl
  result.txt
  result.json
  artifact-manifest.json
  artifacts/
    summary.md
```

Demo workflows use `cf-dw.structured-handoff.v1` to pass compact upstream
evidence across phases. The next implementation stage is to make downstream
phases consume structured `artifact-manifest.json` entries directly instead of
concatenating variable natural-language stdout.

## What To Read Next

- [Current design / 当前设计说明](./docs/current-design-cn.md)
- [MVP test record / Adapter MVP 测试记录](./docs/mvp-test-record-cn.md)
- [Demo benchmark report / 五个 Demo 实测 Benchmark 报告](./docs/demo-benchmark-report-cn.md)
- [Release readiness / GitHub 发布准备说明](./docs/release-readiness-cn.md)
- [GitHub release checklist / 发布执行清单](./docs/github-publish-checklist-cn.md)
- [Token efficiency playbook](./docs/token-efficiency-playbook-cn.md)
- [v0.1.0-alpha release notes](./docs/releases/v0.1.0-alpha.md)
- [ODW + C-FDW real run report / 真实动态工作流运行报告](./docs/odw-real-run-report-cn.md)
- [ReasoniX harness report / ReasoniX Harness 接入与试跑报告](./docs/reasonix-harness-run-report-cn.md)

## License

ADW is source-available for non-commercial use only.

No commercial use is granted by the public license. This includes SaaS,
commercial hosting, paid services, product integration, commercial internal
operations, and commercial benchmarking or model-agent infrastructure use.

See [LICENSE.md](./LICENSE.md).
