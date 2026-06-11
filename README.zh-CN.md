<p align="center">
  <img src="assets/deepseek-dynamic-workflow-avatar.png" alt="DeepSeek Dynamic Workflow mascot avatar" width="180" />
</p>

<p align="center">
  <a href="./README.md">English</a> · <strong>简体中文</strong> · <a href="./README.ru.md">Русский</a>
</p>

# DeepSeek Dynamic Workflow

<p align="center">
  <a href="https://github.com/giao-123-sun/DeepSeek-Dynamic-Workflow/actions/workflows/ci.yml"><img src="https://github.com/giao-123-sun/DeepSeek-Dynamic-Workflow/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/giao-123-sun/DeepSeek-Dynamic-Workflow/actions/workflows/release-source.yml"><img src="https://github.com/giao-123-sun/DeepSeek-Dynamic-Workflow/actions/workflows/release-source.yml/badge.svg" alt="release source"></a>
  <img src="https://img.shields.io/badge/prompt_cache-88.20%25-brightgreen" alt="88.20% prompt cache hit">
  <img src="https://img.shields.io/badge/agents-23_demo_runs-blue" alt="23 demo agents">
  <img src="https://img.shields.io/badge/license-non--commercial_source--available-lightgrey" alt="non-commercial source-available license">
</p>

<p align="center">
  Cache-first 动态工作流 · DeepSeek prompt cache 指标 · agent 产物 · dashboard 可观测性
</p>

<p align="center">
  <b>DDW 把昂贵的 multi-agent workflow 变成可度量、可复用、低成本的 DeepSeek 运行。</b><br>
  并行展开 agent，保持 prefix warm，跨阶段传递产物，并直接看到真实 cache hit。
</p>

---

**DeepSeek Dynamic Workflow (DDW)** 是一个面向 DeepSeek agents 的 cache-first 动态工作流 runtime。它适合多 agent 分阶段并行运行：多个 agent 可以搜索、检查、验证、比较、汇总，同时复用稳定上下文，并留下可审计的运行产物。

> 当前 CLI 仍保留历史 `cf-dw-*` 命令、`.cf-dw/` runtime 目录和 legacy protocol names，用于兼容已有脚本和历史产物。项目名称统一为 DeepSeek Dynamic Workflow，简称 DDW。

> 许可证说明：DDW 是 source-available 的非商业项目。商业使用需要单独书面许可。详见 [LICENSE.md](./LICENSE.md) 和 [NOTICE.md](./NOTICE.md)。

## 快速开始

```bash
git clone https://github.com/giao-123-sun/DeepSeek-Dynamic-Workflow.git
cd DeepSeek-Dynamic-Workflow
npm install
npm run build
npm run check
npm run setup:odw
```

创建本地 `.env`：

```text
DEEPSEEK_API_KEY=...
```

`.env`、transcripts、run artifacts、logs、dashboards 和本地报告都会被 git 忽略。

## 让 Agent 帮你安装

把下面这段直接粘贴给 Codex、Claude Code、Whale 或其他 coding agent：

```text
Install DeepSeek Dynamic Workflow (DDW) in the current workspace.

Repository: https://github.com/giao-123-sun/DeepSeek-Dynamic-Workflow

Steps:
1. If the repository is not present, clone it. If it is already present, enter it.
2. Run npm install, npm run build, and npm run check.
3. Create .env from .env.example if .env does not exist.
4. Ask me to set DEEPSEEK_API_KEY locally if it is missing. Do not print secrets.
5. Run npm run setup:odw so the bundled Open Dynamic Workflows runtime is cloned and built under .cf-dw/vendor/.
6. Run npm run demo:dashboards to generate local dashboard files when possible.
7. Run npm run release:audit if local demo artifacts are available.
8. Report the install status, any failed command, and the next command I should run.

Do not overwrite unrelated local changes.
```

## 为什么需要 DDW

动态工作流的价值在于：复杂任务可以拆成多个阶段，让多个 agent 并行探索、交叉验证、传递产物，最终形成更高质量的结果。

DDW 的核心定位是：**把 DeepSeek 的高缓存命中优势接进动态工作流**。在很多真实场景里，成本是 multi-agent workflow 普及的关键瓶颈；DeepSeek 的 prompt cache 机制、低价格和稳定性能，让 cache-first 的动态工作流变得更实际。

## 核心能力

| 能力 | 为什么重要 |
|---|---|
| **Cache-first dynamic workflows** | Stable prefixes 让多个 agent 复用共享上下文，降低重复运行成本。 |
| **真实 prompt-cache 指标** | 当前 demo suite 在 23 个 agents 上达到 **88.20% cache hit**，每个 session 记录 cache hit/miss。 |
| **并行 agent phases** | 支持 fan-out research、multi-perspective review、conflict detection、verification 和 synthesis。 |
| **默认产物化** | 每个 agent 可以留下 transcripts、JSON results、summaries、manifests 和下游可用文件。 |
| **Dashboard 可观测性** | 展示 workflow 状态、阶段、agent squares、tokens、tools、runtime、cache hit rate 和 artifact previews。 |
| **按需自治 harness** | 轻量 agent 保持低成本；复杂 agent 可以进入 tool-capable harness 执行多步任务。 |

已验证 demo 指标：

```text
demo workflows  = 5
agents          = 23
reasonix agents = 20
cache hit       = 202,880 tokens
cache miss      = 27,142 tokens
hit rate        = 88.20%
```

详见 [docs/demo-benchmark-report-cn.md](./docs/demo-benchmark-report-cn.md) 和 [docs/token-efficiency-playbook-cn.md](./docs/token-efficiency-playbook-cn.md)。

## 工作方式

一个 workflow `agent()` 会变成一个 cache-stable、observable 的 agent run：

```text
ODW agent(prompt)
-> DDW adapter
-> Native DDW AgentSession or autonomous harness
-> DeepSeek-compatible model call
-> usage ledger + transcript + artifacts
-> workflow dashboard
```

DDW 适合多 agent 跨阶段协作：复用 stable prefix，传递 structured artifacts，并暴露真实 cache-hit 指标。

## 架构

![DeepSeek Dynamic Workflow architecture](assets/cf-dw-architecture.png)

## 运行一个 Native Agent

Native DDW 适合便宜、可控、轻量的任务：classification、summary、tagging、simple JSON conversion、read-only file inspection。

```bash
node dist/index.js \
  --cwd . \
  --prompt "List the top-level files and summarize the project." \
  --cache-group-id ddw_local_probe_v1 \
  --session-id agent_001 \
  --max-turns 4
```

## 运行一个 Harness Agent

Autonomous harness 适合更复杂的多步任务：codebase analysis、multi-tool phase work、未来的 CDP/browser workflows、高价值 synthesis。

```bash
node dist/reasonix-agent.js \
  --cwd . \
  --prompt "Inspect README.md and explain what DDW does." \
  --cache-group-id ddw_reasonix_probe_v1 \
  --session-id auto \
  --model deepseek-v4-flash \
  --effort low \
  --budget 0.04 \
  --no-proxy
```

当前 wrapper 语义：

```text
one workflow agent = one harness run = one transcript = one DDW session
```

## 构建 Stable Prefix

```bash
node dist/prefix-cli.js \
  --cwd . \
  --output .cf-dw/prefix/cache-prefix.xml \
  --style xml \
  --include "src/**/*.ts,README.md,package.json,odw*.json,examples/**/*.js,examples/**/*.json,examples/**/*.md" \
  --compress
```

配合 Native agent 使用：

```bash
node dist/index.js \
  --cwd . \
  --prompt-file ./examples/prompts/workspace-summary.md \
  --prefix-file ./.cf-dw/prefix/cache-prefix.xml \
  --cache-group-id ddw_workspace_v1 \
  --session-id agent_workspace_001
```

## Dashboard

从真实 run artifacts 生成 dashboard：

```bash
node dist/dashboard.js \
  --runs-root ./.cf-dw/runs \
  --workflow-tag reasonix-odw-demo \
  --latest-per-agent \
  --output ./.cf-dw/reports/reasonix-odw-demo-dashboard.html
```

Dashboard 展示 workflow title、status、duration、total tokens、phases、agent squares、tokens、tools、cache hit rate、runtime、backend 和 artifact previews。

## Demo Suite

DDW 会通过 `npm run setup:odw` 把 Open Dynamic Workflows 安装到 `.cf-dw/vendor/open-dynamic-workflows/` 并构建它的 CLI。`npm run demo:run` 在缺少 ODW 时会自动先执行这一步，所以新 clone 的项目可以直接跑完整 demo 链路。

```bash
npm run setup:odw
npm run demo:run
npm run demo:dashboards
npm run release:audit
```

五个实用 demo：

| Demo | Backend | Metric |
|---|---|---|
| Cache ROI Benchmark | Native + ReasoniX | 90.67% cache hit |
| Codebase Architecture Audit | Native + ReasoniX | 88.42% cache hit |
| Policy / Legal Conflict Mining | ReasoniX | 88.79% cache hit |
| Multi-City Deep Research | ReasoniX | 85.16% cache hit |
| Web/CDP Evidence Extraction | ReasoniX, CDP-ready | 85.86% cache hit |

## 运行产物

Native DDW agent 写入：

```text
<cwd>/.cf-dw/runs/<session_id>/
  session.json
  usage.jsonl
```

Harness agent 会额外写入 transcript、result 和 artifact manifest：

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

## 许可证

DDW 只面向非商业使用开放源代码。

公开许可证不授予商业使用权，包括 SaaS、商业托管、付费服务、产品集成、商业内部运营、商业 benchmarking 或 model-agent infrastructure 使用。

详见 [LICENSE.md](./LICENSE.md)。
