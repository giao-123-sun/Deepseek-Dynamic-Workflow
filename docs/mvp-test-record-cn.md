# C-FDW Adapter MVP 测试记录

**日期**：2026-06-09
**范围**：版本一 / ODW custom adapter 形态 / `cf-dw-agent` MVP

## 已实现

1. `cf-dw-agent` CLI。
2. DeepSeek OpenAI-compatible chat client。
3. `cache_group_id` 到 DeepSeek `user_id` 的映射。
4. immutable prefix builder。
5. per-agent append-only session store。
6. 内部 JSON 工具协议。
7. 只读工具：`list_directory`、`read_file`、`grep`。
8. usage ledger：记录 `prompt_cache_hit_tokens`、`prompt_cache_miss_tokens`、latency、turn、model。
9. `cf-dw-report`：汇总 run / runs root 的缓存命中率和 token 使用。
10. ODW adapter 配置示例。
11. `cf-dw-prefix`：调用本地 Repomix 生成稳定 prefix，并输出 manifest/hash。
12. `cf-dw-dashboard`：生成动态工作流运行可视化 dashboard，支持 workflow JSON 和 usage ledger fallback。
13. `.env` 自动加载：从当前目录和 `--cwd` 读取 `DEEPSEEK_API_KEY`。

## 已验证

### 1. 本地 dry-run

命令：

```bash
node dist/index.js \
  --cwd .. \
  --prompt "Dry run only." \
  --cache-group-id cf_dw_dry_run_v1 \
  --session-id agent_dry_run \
  --dry-run
```

结果：

```text
Dry run complete for session agent_dry_run.
```

验证点：

1. CLI 参数解析正常。
2. session artifact 正常写入。
3. 不需要 API key 即可做本地集成验证。

### 2. DeepSeek smoke test

配置：

```text
model = deepseek-v4-flash
cache_group_id = cf_dw_smoke_v1
prefix = examples/prefix/minimal-prefix.md
max_turns = 1
```

第一次运行：

```text
prompt_cache_hit_tokens = 0
prompt_cache_miss_tokens = 511
hit_rate = 0.00%
```

第二次同 cache group 运行：

```text
prompt_cache_hit_tokens = 384
prompt_cache_miss_tokens = 128
hit_rate = 75.00%
```

验证点：

1. DeepSeek API 调用正常。
2. `deepseek-v4-flash` 模型可用。
3. usage 中正常返回 cache hit/miss tokens。
4. 相同 `cache_group_id` 和稳定 prefix 下，第二次请求出现明显 cache hit。

### 3. 工具循环 live test

任务：

```text
Use the list_directory tool on examples, then return a final answer with the entries you observed.
```

结果：

```text
The 'examples' directory contains:
- file: odw.config.json
- directory: prefix
- directory: prompts
```

验证点：

1. 模型第一轮按协议输出 `tool_calls`。
2. worker 执行 `list_directory`。
3. tool result 以稳定 JSON 写入 append-only log。
4. 模型第二轮输出 `final`。
5. `usage.jsonl` 记录两轮调用。

### 4. 报告汇总

命令：

```bash
node dist/report.js --runs-root ./.cf-dw/runs
```

示例结果：

```text
run=agent_smoke_001 turns=1 hit=0 miss=511 hit_rate=0.00%
run=agent_smoke_002 turns=1 hit=384 miss=128 hit_rate=75.00%
run=agent_tool_001 turns=2 hit=0 miss=1190 hit_rate=0.00%
aggregate runs=3 turns=4 hit=384 miss=1829 hit_rate=17.35%
```

验证点：

1. run-level report 正常。
2. aggregate report 正常。
3. 可作为 ODW v0.1 artifact report 的基础。

### 5. Repomix prefix build

命令：

```bash
node dist/prefix-cli.js \
  --cwd . \
  --output .cf-dw/prefix/cache-prefix.xml \
  --style xml \
  --include "src/**/*.ts,README.md,package.json,examples/**/*.json,examples/**/*.md" \
  --compress
```

结果：

```text
prefix=.cf-dw/prefix/cache-prefix.xml
manifest=.cf-dw/prefix/cache-prefix.xml.manifest.json
sha256=db81078c01b03be3acf2d2ac675a116d7324d6639f4c1f9d31c2eface67cc5b7
```

验证点：

1. 本地 Repomix devDependency 可用。
2. `--include`、`--ignore`、`--compress` 可通过 C-FDW wrapper 传入。
3. prefix 文件和 manifest 正常生成。
4. `cf-dw-agent --prefix-file` 可读取该真实 Repomix prefix。

### 6. HTML dashboard

命令：

```bash
node dist/dashboard.js \
  --workflow-file ./examples/workflows/lexfodra-round3-demo.json \
  --output ./.cf-dw/reports/workflow-dashboard.html
```

浏览器验证：

```text
title = lexfodra-round3-deep-analysis
phaseCount = 6
dotCount = 23
rowCount = 23
hasHorizontalOverflow = false
```

验证点：

1. 静态 HTML 可通过 localhost 正常加载。
2. workflow 标题、状态、耗时、agents/tokens/cache 总览正常显示。
3. phase 展开/折叠、agent 小方块、agent 明细表正常显示。
4. agent hover tooltip 包含上下文摘要。
5. 桌面视口没有水平溢出。

## 当前限制

1. 还没有接入真实 ODW runtime，只提供 adapter command shape。
2. 目前工具协议是内部 JSON 协议，还没有使用原生 OpenAI tool calling。
3. prefix builder 已能调用 Repomix CLI，但还没有做 prefix drift 对比报告。
4. schema validator 目前只做协议级解析，尚未接 JSON Schema / Zod。
5. read-only tools 是串行执行，尚未做并发 dispatch。
6. report 只统计 tokens 和 latency，尚未计算美元成本。

## 下一步建议

1. 增加 JSON Schema validator 和稳定 retry feedback。
2. 增加 ODW example workflow，实际跑 10 agent fan-out。
3. 增加 prefix drift detector。
4. 增加 read-only tool parallel dispatch。
5. 增加 cost pricing config 和美元成本报告。
6. 给 dashboard 增加 per-turn waterfall。
7. 将真实 ODW phase/agent event stream 写成 workflow JSON，驱动 dashboard 实时刷新。
