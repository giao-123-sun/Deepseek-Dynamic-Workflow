# ODW + DDW 真实动态工作流运行报告

**日期**：2026-06-10
**ODW 仓库**：`https://github.com/xz1220/open-dynamic-workflows`
**本地路径**：`<DDW>/.cf-dw/vendor/open-dynamic-workflows`
**DDW 路径**：`C:/Users/admin/Documents/agioa/agent_more/cf-dw`

## 1. 是否已经接入真实动态工作流

已经接入。

本次不是 mock，也不是直接调用 `cf-dw-agent`。实际链路是：

```text
ODW workflow script
-> ODW phase / parallel / agent primitives
-> ODW custom adapter command
-> cf-dw-agent
-> DeepSeek AgentSession loop
-> local read-only tools
-> usage ledger / session artifacts
-> DDW workflow dashboard
```

ODW 运行命令：

```bash
npm run setup:odw

node ./.cf-dw/vendor/open-dynamic-workflows/dist/cli.js run ./examples/odw-real-demo.js \
  --config ./odw.config.json \
  --runs-root ./.odw/runs \
  --wait \
  --timeout 1200
```

ODW workflow：

```text
examples/odw-real-demo.js
```

ODW adapter config：

```text
odw.config.json
```

## 2. 真实 run 结果

### 第一次 run

Run id：

```text
20260610-020201-e7d617
```

结果：

```text
Phase A: 2/2 agents completed
Phase B: 0/2 agents completed, both failed with adapter process exit code 3221225794
Phase C: 1/1 agent completed
```

结论：

ODW 容错正常，parallel 内失败 agent 被折叠为 `null`，workflow 继续 synthesis。但 Windows 下并发执行两个 `cf-dw-agent` 进程时出现过进程级崩溃。

### 第二次 run

将 ODW concurrency 从 `2` 降到 `1` 后重新运行。

Run id：

```text
20260610-020434-3399f2
```

结果：

```text
Phase A: Adapter Surface Inspection
  inspect:prefix-builder completed
  inspect:session-loop completed

Phase B: Visualization & Demo Planning
  inspect:workflow-dashboard completed
  plan:practical-demos completed

Phase C: Synthesis
  synthesis:system-readiness completed
```

完整成功率：

```text
5 / 5 agents completed = 100%
```

## 3. 缓存与 token 指标

第二次完整 run 的真实 `usage.jsonl` 汇总：

```text
agents      = 5
tools       = 9
prompt      = 109,199 tokens
completion  = 5,777 tokens
total       = 114,976 tokens
cache hit   = 90,624 tokens
cache miss  = 18,575 tokens
hit rate    = 82.99%
```

说明：

1. 这是完整 run 的 5 个 agent 聚合结果。
2. 命中率来自 DeepSeek usage 字段：`prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`。
3. 第一次 partial run 和第二次 full run 使用了相同 `cache_group_id`，所以第二次 run 获得明显 warm-cache 收益。

## 4. 准确率 / 召回如何理解

当前这个 demo 是系统集成和代码审查类 workflow，没有预先标注的 ground truth，所以严格意义上的“准确率/召回率”不能直接给出。

可以给出的实测指标是：

```text
execution success rate = 100% on second run
cache hit rate         = 82.99%
tool-call completion   = 9 tool results written
phase completion       = 3/3 phases completed
agent completion       = 5/5 agents completed
```

如果要测“召回率”，需要定义标注集。例如：

```text
目标：审计 DDW adapter 是否覆盖 6 个关键模块
gold modules:
  prefix builder
  AgentSession loop
  session store
  usage ledger
  tool router
  dashboard
```

然后检查最终报告是否覆盖这些模块。这个 demo 中覆盖了 prefix builder、session loop、session store、usage ledger、dashboard 和 demo planning；tool router 只被间接涉及，未作为独立审计对象。因此按该临时 gold set 可粗略视为：

```text
module recall = 5 / 6 = 83.3%
```

这只是 smoke benchmark，不是正式算法评测。

正式评测应使用：

1. 固定 corpus。
2. 标注 finding / answer / conflict 的 gold set。
3. 自动评分脚本。
4. 多次冷热 cache 对照。

## 5. Dashboard

真实 run dashboard 已生成：

```text
.cf-dw/reports/odw-real-demo-dashboard.html
```

当前 dashboard 通过 `C_FDW_WORKFLOW: odw-real-demo` 从 session prompt 中识别 workflow，并按 `C_FDW_PHASE` / `C_FDW_AGENT` 分组。

注意：

该 dashboard 当前会显示同一 workflow tag 下的所有 artifacts，包括第一次 partial run 和第二次 full run。因此 dashboard 总览数值会比“第二次完整 run”更大。后续应增加 `--run-id` 或 `--since` 过滤。

## 6. 推荐实际 demo

### Demo A：缓存 ROI Benchmark

目标用户：

```text
AI infra / 平台团队
```

输入：

```text
同一 repo prefix + 同一 workflow 连续运行 3 次
```

展示：

1. cold run miss 多。
2. warm run hit 明显上升。
3. dashboard 展示每 agent hit rate。

指标：

```text
cache hit rate
prompt token cost saved
latency p50/p95
```

### Demo B：代码库架构审计

目标用户：

```text
工程负责人 / 架构师
```

输入：

```text
一个真实 repo
```

Workflow：

```text
Phase A: 并行审计 prefix/session/tool/dashboard/api client
Phase B: 风险归类
Phase C: 输出 migration plan
```

指标：

```text
agent success rate
finding recall against known issue list
cache hit rate
time to report
```

### Demo C：法规 / 政策冲突挖掘

目标用户：

```text
法律团队 / 政策研究团队
```

输入：

```text
城市政策文档 + 上位法或规则库
```

Workflow：

```text
Phase A: P0 文档抓取
Phase B: 多城市专项搜索
Phase C: 标准化与标签
Phase D: 冲突检测
Phase E: 验证评分
Phase F: 对抗与报告
```

指标：

```text
gold conflict recall
precision after human review
cache hit rate
cost per confirmed finding
```

### Demo D：多城市 / 多领域深度研究

目标用户：

```text
咨询、投研、公共政策、市场研究团队
```

输入：

```text
10 城 × 6 领域问题列表
```

Workflow：

```text
parallel city/domain agents
-> evidence normalization
-> cross-jurisdiction comparison
-> final synthesis
```

指标：

```text
coverage per city/domain
evidence count
cache hit rate
report completion time
```

### Demo E：工作流观测与瓶颈诊断

目标用户：

```text
agent workflow operator / demo presenter
```

输入：

```text
.cf-dw/runs + .odw/runs
```

展示：

1. workflow status。
2. phase 展开。
3. agent 小方块。
4. tokens/tools/time/cache。
5. artifact。

指标：

```text
time to identify slowest agent
lowest-cache phase
failed-agent recovery rate
```

## 7. 下一步工程建议

1. 增加 `cf-dw-dashboard --run-id` 或 `--since`，避免同 tag 多次 run 混在一起。
2. 修复 Windows 并发 agent 进程偶发崩溃，或先默认 ODW concurrency=1/2 做稳定档。
3. 给 DeepSeek client 加指数退避重试。
4. 给 ODW run exporter 增加直接读取 `.odw/runs/<workflow>/<runId>/events.jsonl` 的能力。
5. 增加正式 benchmark：gold set + precision / recall scorer。
