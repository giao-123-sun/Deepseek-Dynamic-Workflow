# ReasoniX Harness 接入与试跑报告

**日期**：2026-06-10
**包名**：`reasonix`
**版本**：`0.53.2`
**定位**：DeepSeek-native coding agent / harness，强调 cache-first loop、flash-first cost control、tool-call repair。

## 1. 是否已安装

已安装到 C-FDW 本地项目：

```text
cf-dw/node_modules/reasonix
```

版本确认：

```text
reasonix 0.53.2
```

Doctor 结果：

```text
8 ok · 1 warn · 0 fail
api key        set via env DEEPSEEK_API_KEY
api reach      /models ok — 2 models (deepseek-v4-flash, deepseek-v4-pro)
```

说明：

1. `.env` 中的 `DEEPSEEK_API_KEY` 可被注入给 ReasoniX。
2. DeepSeek API 可达。
3. ReasoniX tokenizer、sessions、project 检查正常。

## 2. 单 agent smoke

直接运行 ReasoniX：

```bash
npx reasonix run \
  --no-config \
  --no-proxy \
  --model deepseek-v4-flash \
  --effort low \
  --budget 0.02 \
  --transcript ./.cf-dw/reasonix/smoke-transcript.jsonl \
  "你是一个测试 agent。请只输出一行：ReasoniX harness smoke ok。"
```

结果：

```text
ReasoniX harness smoke ok
turns: 1
cache: 0.0%
cost: $0.000171
```

Transcript 中真实 usage 字段：

```json
{
  "prompt_tokens": 1140,
  "completion_tokens": 39,
  "total_tokens": 1179,
  "prompt_cache_hit_tokens": 0,
  "prompt_cache_miss_tokens": 1140,
  "prefixHash": "9f7390114049edb3"
}
```

## 3. C-FDW ReasoniX wrapper

新增 wrapper：

```text
src/reasonix-agent.ts
```

命令：

```text
cf-dw-reasonix-agent
```

作用：

1. 读取 ODW `prompt_file`。
2. 调用 `reasonix run`。
3. 将 ReasoniX transcript 保存到 C-FDW run artifact。
4. 将 ReasoniX usage 转换成 C-FDW `usage.jsonl`。
5. 生成 C-FDW `session.json`，让 dashboard 可以直接读取。

注意：

Windows 下不应通过 `reasonix.cmd` + `shell:true` 传多行 prompt，否则参数可能被拆坏。wrapper 现在默认直接调用：

```text
node node_modules/reasonix/dist/cli/index.js
```

## 4. 真实 ODW + ReasoniX run

ODW workflow：

```text
examples/odw-reasonix-demo.js
```

ODW config：

```text
odw.reasonix.config.json
```

运行命令：

```bash
node ../open-dynamic-workflows/dist/cli.js run ./examples/odw-reasonix-demo.js \
  --config ./odw.reasonix.config.json \
  --runs-root ./.odw/runs \
  --wait \
  --timeout 900
```

Run id：

```text
20260610-030627-de14a6
```

ODW logs：

```text
Phase A: ReasoniX Harness Probes
  reasonix:cache-probe completed
  reasonix:harness-fit completed

Phase B: Synthesis
  reasonix:synthesis completed
```

成功率：

```text
3 / 3 agents completed = 100%
```

## 5. 贯穿缓存命中

真实 C-FDW usage 聚合：

```text
agents      = 3
prompt      = 1,918 tokens
completion  = 1,280 tokens
total       = 3,198 tokens
cache hit   = 1,280 tokens
cache miss  = 638 tokens
hit rate    = 66.74%
```

按 agent：

```text
reasonix:harness-fit  hit=384  miss=206  hitRate=65.08%
reasonix:cache-probe  hit=384  miss=208  hitRate=64.86%
reasonix:synthesis    hit=512  miss=224  hitRate=69.57%
```

Dashboard：

```text
.cf-dw/reports/reasonix-odw-demo-dashboard.html
```

浏览器验证：

```text
title = reasonix-odw-demo
phaseCount = 2
dotCount = 3
rowCount = 3
hasHorizontalOverflow = false
```

## 6. 关键观察

1. ReasoniX 可以作为 ODW 每个 `agent()` 的 harness。
2. ODW 并发 2 调 ReasoniX wrapper 正常完成，没有复现之前原生 `cf-dw-agent` 的 Windows 并发崩溃。
3. ReasoniX transcript 原生提供 `usage.prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` / `prefixHash`。
4. ReasoniX agent 自述不一定可靠。例如本次 `cache-probe` 曾回答 `cache_status/cache_key`，但真实 transcript 字段不是这些。所以缓存指标必须由系统读取 transcript，不应靠 agent 自己解释。
5. `reasonix run` 是非交互任务 harness；`reasonix code` 是交互式代码会话，不适合作为 ODW 自动 worker 的第一选择。

## 7. 和原生 cf-dw-agent 的定位差异

| 方案 | 优点 | 限制 | 适合场景 |
|---|---|---|---|
| `cf-dw-agent` 原生 worker | 我们完全可控；能实现自定义 tool loop、prefix、ledger、dashboard | 需要自己做 tool repair、重试、并发稳定性 | 产品核心 runtime |
| `cf-dw-reasonix-agent` wrapper | ReasoniX 已有 cache/cost/transcript/harness 能力；并发试跑稳定 | 可控性弱；工具/策略由 ReasoniX 决定；输出可能带 harness 风格 | 快速 demo、对比基线、外部 harness backend |

## 8. 下一步建议

1. 给 dashboard 增加 backend 字段：`native-cfdw` / `reasonix`。
2. 让 ODW config 可在同一 workflow 中混用两个 adapter，比较命中率和稳定性。
3. 增加 `cf-dw-reasonix-agent --system` 配置暴露到 ODW adapter config。
4. 把 ReasoniX transcript 的 `cost` 和 `prefixHash` 也映射到 C-FDW dashboard。
5. 用同一个 workflow 重复跑 3 次，比较 ReasoniX backend 的 cold/warm cache 曲线。
