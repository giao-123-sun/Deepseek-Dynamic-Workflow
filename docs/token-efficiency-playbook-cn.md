# DDW Token Efficiency Playbook

**Date:** 2026-06-10
**Source:** GitHub Blog, [Improving token efficiency in GitHub Agentic Workflows](https://github.blog/ai-and-ml/github-copilot/improving-token-efficiency-in-github-agentic-workflows/)

这份 playbook 把 GitHub agentic workflow 的 token efficiency 经验转成 DDW 的工程规则。目标不是单纯少花 token，而是在动态工作流仍然能并行探索、交叉验证、产出 artifact 的前提下，让成本、缓存命中、输出膨胀和 runaway loop 都可观测、可审计、可优化。

## 1. 统一 usage ledger

GitHub 的核心经验之一是：先把每一次模型调用的用量标准化记录下来，再谈优化。DDW 当前已经把 Native worker 和 ReasoniX transcript 都归一到每个 run 的 `usage.jsonl`：

```json
{
  "sessionId": "...",
  "cacheGroupId": "...",
  "turn": 1,
  "model": "DeepSeek-chat",
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0,
    "prompt_cache_hit_tokens": 0,
    "prompt_cache_miss_tokens": 0
  },
  "latencyMs": 0,
  "createdAt": "..."
}
```

工程规则：

1. 缓存命中只从 API usage 或 ReasoniX transcript 解析，不接受 agent 自述。
2. 每个 ODW agent 必须生成独立 `usage.jsonl`。
3. release audit 必须从真实 run artifacts 汇总，而不是从文档数字汇总。
4. dashboard、report、release audit 共用同一套聚合口径。

## 2. 增加 Effective Tokens

只看 `total_tokens` 不够，因为 cache-read token、miss input token 和 output token 的成本压力不同。GitHub 文章使用了一个加权口径，DDW 当前采用同一类有效 token 指标：

```text
effective_tokens = model_multiplier * (miss_input + 0.1 * cache_read + 4 * output)
```

在 DeepSeek prompt cache 语境下：

```text
miss_input = prompt_cache_miss_tokens
cache_read = prompt_cache_hit_tokens
output     = completion_tokens
```

如果某个 provider 没有 hit/miss 字段，则 DDW 回退为：

```text
miss_input = prompt_tokens
cache_read = 0
```

当前 `model_multiplier` 默认是 `1.0`。后续可以按 DeepSeek、OpenAI、本地模型或 Pro 路由的真实价格/延迟乘数配置。

已落地：

1. `cf-dw-report` 输出每个 run 和 aggregate 的 `effective`。
2. `cf-dw-dashboard` 展示 workflow 级和 agent 级 `Eff Tokens`。
3. `cf-dw-release-audit` 在 demo gate 和 aggregate 中输出 `et`。

为什么重要：

1. 如果 cache hit 很高但 output 过长，ET 会明显上升。
2. 如果 agent 进入循环，turns、completion 和 ET 会一起上升。
3. 如果一次优化只是把输入变短但输出变长，ET 能暴露这种转移。

## 3. 工具 schema 要可裁剪

GitHub 文章强调：MCP/tool schemas 如果无差别进入上下文，会在每次请求中反复消耗 token。DDW 的对应原则是：

1. Native worker 默认只开放 `read_file`、`list_directory`、`grep` 三类窄工具。
2. ReasoniX harness 作为复杂 agent 环境使用，但应按 phase 配置权限，而不是所有 agent 默认全开。
3. CDP/OpenCLI/Web 工具只给需要网页操作的 phase，不给纯分析、打标、合成 phase。
4. 后续增加 `tool_profile`：`readonly-code`、`web-evidence`、`policy-research`、`synthesis-only`。

判断标准：

```text
一个工具如果该 phase 不会调用，就不应该进入该 phase 的 agent context。
```

## 4. 确定性数据获取优先于 agentic fetch

GitHub 的另一个重要经验是：如果某些数据总是需要，就应该用确定性 CLI 或预处理脚本先拿到，而不是让 agent 在对话中一步步拿。DDW 对应策略：

1. repo 上下文用 Repomix prefix 预生成。
2. workflow 前置材料用 deterministic collector 写入 artifact。
3. agent prompt 只传 artifact manifest、hash、短摘要和必要路径。
4. ReasoniX/CDP 只处理需要判断、点击、验证、提取的复杂部分。

这直接影响动态工作流的成本结构：

```text
pre-agentic collector:
  cheap, deterministic, cacheable

ReasoniX/CDP agent:
  expensive, flexible, only for uncertain work
```

## 5. 用 turns 和 ET 发现 runaway loop

单看 cache hit 容易漏掉循环问题，因为循环中的请求可能仍然命中缓存。DDW release audit 和 dashboard 应同时关注：

1. turns / transcript lines 是否异常增加。
2. tools 调用次数是否异常增加。
3. output token 和 ET 是否异常增加。
4. agent runtime 是否明显偏离同类 agent。
5. artifact 是否缺失或 degraded。

当前已经落地：

1. ReasoniX transcript lines 进入 release audit。
2. dashboard 展示 tools、runtime、cache、tokens、Eff Tokens。
3. release audit 要求 demo 有 ReasoniX transcript 和 artifact evidence。

下一步可以增加：

```text
daily token auditor
daily token optimizer
per-agent anomaly baseline
runaway-loop fail gate
```

## 6. 结构化 handoff 降低 prompt drift

GitHub 文章的经验可以延伸到 DDW 的跨阶段数据传输：上下游 agent 之间不要传大段自由文本，而应该传稳定结构。

DDW 当前 demo 已经使用：

```text
cf-dw.structured-handoff.v1
```

每个 item 带：

```text
label
hash
chars
excerpt
```

这有三个收益：

1. synthesis prompt 更稳定，缓存更容易命中。
2. 下游只消费必要摘要，不重复吞大段材料。
3. artifact manifest 可以逐步替代 stdout 拼接。

下一步推荐把 handoff 升级为：

```text
artifact-manifest.json -> next phase manifest input
```

## 7. 以 portfolio 视角看动态工作流

动态工作流不是一个 agent，而是一组可复用 episode。GitHub 的经验提醒我们：优化应看整个工作流组合，而不是只看单次调用。

DDW 的 portfolio 指标：

1. 每个 demo 的 cache hit rate。
2. 每个 demo 的 effective tokens。
3. 每个 phase 的 agent 数量和 backend 分布。
4. Native vs ReasoniX 的成本差异。
5. artifact 产出率。
6. 同类 workflow 的 prefix 复用率。

建议的 release gate：

```text
cache_hit_rate >= threshold
effective_tokens <= baseline * tolerance
reasonix_transcript_present == true
artifact_manifest_present == true
structured_handoff_present == true
```

## 8. DDW 当前执行结论

这次更新后，DDW 的 token efficiency 体系从“缓存命中率可见”升级为：

```text
cache hit/miss
+ total tokens
+ effective tokens
+ turns/transcript lines
+ tools/runtime
+ artifacts
```

这更接近真实动态工作流产品需要的成本观测面。后续 Self-Evolve 也可以直接读取这些指标：它不仅总结“哪个 agent 做得好”，还可以总结“哪个 phase 的 prompt、tool profile、handoff 结构最省 ET 且产物质量稳定”。
