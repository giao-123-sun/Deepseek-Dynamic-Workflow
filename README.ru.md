<p align="center">
  <img src="assets/deepseek-dynamic-workflow-avatar.png" alt="Аватар-маскот DeepSeek Dynamic Workflow" width="180" />
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a> · <strong>Русский</strong>
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
  Cache-first динамические workflow · метрики prompt cache DeepSeek · артефакты агентов · наблюдаемость через dashboard
</p>

<p align="center">
  <b>DDW превращает дорогие multi-agent workflow в измеримые, повторяемые и недорогие запуски на DeepSeek.</b><br>
  Запускайте агентов параллельно, держите prefix теплым, передавайте артефакты между фазами и смотрите реальные cache hit вместо догадок.
</p>

---

**DeepSeek Dynamic Workflow (DDW)** — это cache-first runtime для динамических workflow на DeepSeek agents. Он рассчитан на задачи, где много агентов параллельно ищут, проверяют, сравнивают и синтезируют результат, переиспользуя стабильный контекст и оставляя проверяемые артефакты.

> Текущие сборки CLI также сохраняют исторические команды `cf-dw-*`, runtime-директорию `.cf-dw/` и legacy protocol names для совместимости. Название проекта — DeepSeek Dynamic Workflow, сокращенно DDW.

> Лицензия: DDW распространяется как source-available software только для некоммерческого использования. Коммерческое использование требует отдельной письменной лицензии. См. [LICENSE.md](./LICENSE.md) и [NOTICE.md](./NOTICE.md).

## Быстрый старт

```bash
git clone https://github.com/giao-123-sun/DeepSeek-Dynamic-Workflow.git
cd DeepSeek-Dynamic-Workflow
npm install
npm run build
npm run check
npm run setup:odw
```

Создайте локальный `.env`:

```text
DEEPSEEK_API_KEY=...
```

`.env`, transcripts, run artifacts, logs, dashboards и локальные отчеты игнорируются git.

## Установка через agent

Скопируйте этот prompt в Codex, Claude Code, Whale или другой coding agent:

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

## Зачем нужен DDW

Динамические workflow позволяют разбивать сложные задачи на фазы: несколько агентов могут исследовать разные направления, проверять друг друга, передавать артефакты и собирать более качественный итоговый результат.

DDW добавляет к этому cache-first слой для DeepSeek: стабильные prefixes, измеримые cache hit / cache miss, структурированные артефакты и dashboard для наблюдения за фазами, агентами, токенами, tool calls и временем выполнения.

## Возможности

| Что | Почему это важно |
|---|---|
| **Cache-first dynamic workflows** | Stable prefixes сохраняют общий контекст теплым между агентами, снижая стоимость повторных workflow. |
| **Проверенные prompt-cache метрики** | Demo runs сейчас показывают **88.20% cache hit** на 23 агентах; hit/miss записываются по каждой session. |
| **Параллельные фазы агентов** | Fan-out research, multi-perspective review, conflict detection, verification и synthesis можно запускать как staged workflow. |
| **Артефакты по умолчанию** | Каждый агент может оставить transcripts, JSON results, summaries, manifests и файлы для следующих фаз. |
| **Dashboard наблюдаемости** | Видны workflow status, phases, agent squares, tokens, tools, runtime, cache hit rate и artifact previews. |
| **Autonomous harness при необходимости** | Легкие агенты остаются дешевыми; сложные агенты могут работать в tool-capable harness для multi-step задач. |

Проверенные demo metrics:

```text
demo workflows  = 5
agents          = 23
reasonix agents = 20
cache hit       = 202,880 tokens
cache miss      = 27,142 tokens
hit rate        = 88.20%
```

См. [docs/demo-benchmark-report-cn.md](./docs/demo-benchmark-report-cn.md) и [docs/token-efficiency-playbook-cn.md](./docs/token-efficiency-playbook-cn.md).

## Как это работает

Один workflow `agent()` превращается в cache-stable, observable agent run:

```text
ODW agent(prompt)
-> DDW adapter
-> Native DDW AgentSession or autonomous harness
-> DeepSeek-compatible model call
-> usage ledger + transcript + artifacts
-> workflow dashboard
```

DDW рассчитан на workflow, где много агентов работают по фазам, переиспользуют stable prefix, передают structured artifacts и показывают реальные cache-hit метрики.

## Архитектура

![DeepSeek Dynamic Workflow architecture](assets/cf-dw-architecture.png)

## Один Native agent

Native DDW подходит для дешевых, контролируемых и легких задач: classification, summary, tagging, simple JSON conversion, read-only file inspection.

```bash
node dist/index.js \
  --cwd . \
  --prompt "List the top-level files and summarize the project." \
  --cache-group-id ddw_local_probe_v1 \
  --session-id agent_001 \
  --max-turns 4
```

## Один harness agent

Autonomous harness подходит для multi-step задач: codebase analysis, multi-tool phase work, future CDP/browser workflows и high-value synthesis.

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

Текущая семантика wrapper:

```text
one workflow agent = one harness run = one transcript = one DDW session
```

## Dashboard

Создать dashboard из реальных run artifacts:

```bash
node dist/dashboard.js \
  --runs-root ./.cf-dw/runs \
  --workflow-tag reasonix-odw-demo \
  --latest-per-agent \
  --output ./.cf-dw/reports/reasonix-odw-demo-dashboard.html
```

Dashboard показывает title, status, duration, total tokens, phases, agent squares, tokens, tools, cache hit rate, runtime, backend и artifact previews.

## Demo suite

`npm run setup:odw` устанавливает Open Dynamic Workflows в `.cf-dw/vendor/open-dynamic-workflows/` и собирает его CLI. `npm run demo:run` автоматически запускает этот setup, если ODW еще не установлен.

```bash
npm run setup:odw
npm run demo:run
npm run demo:dashboards
npm run release:audit
```

Пять практических demo:

| Demo | Backend | Metric |
|---|---|---|
| Cache ROI Benchmark | Native + ReasoniX | 90.67% cache hit |
| Codebase Architecture Audit | Native + ReasoniX | 88.42% cache hit |
| Policy / Legal Conflict Mining | ReasoniX | 88.79% cache hit |
| Multi-City Deep Research | ReasoniX | 85.16% cache hit |
| Web/CDP Evidence Extraction | ReasoniX, CDP-ready | 85.86% cache hit |

## Лицензия

DDW доступен как source-available software только для некоммерческого использования.

Публичная лицензия не предоставляет коммерческие права, включая SaaS, paid services, product integration, commercial internal operations и commercial benchmarking/model-agent infrastructure use.

См. [LICENSE.md](./LICENSE.md).
