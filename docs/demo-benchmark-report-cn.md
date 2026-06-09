# CFDW 五个 Demo 实测 Benchmark 报告

**日期**：2026-06-10
**范围**：GitHub 发布前 demo suite / ODW mixed adapter / DeepSeek cache-first / ReasoniX harness
**配置**：`odw.mixed.config.json`
**缓存组**：`cf_dw_demo_suite_v1`
**Prefix**：Repomix stable prefix + ReasoniX compact prefix (`--prefix-max-chars 12000`)

## 1. 结论摘要

5 个 demo 已完成真实 ODW 运行，覆盖 Native C-FDW、ReasoniX harness、并发 fan-out、多阶段 synthesis、政策冲突分析、多城市研究和 CDP-ready 浏览器证据协议设计。

最新有效 warm runs 汇总：

```text
demos        = 5
agents       = 23
cache hit    = 200,336 tokens
cache miss   = 24,214 tokens
hit rate     = 89.22%
```

这说明当前 cache-first 策略在 demo suite 上已经达到 80-90%+ 的发布目标。

## 2. 实测结果

| Demo | ODW run id | Agents | Cache hit | Cache miss | Hit rate | 后端 |
|---|---:|---:|---:|---:|---:|---|
| Cache ROI Benchmark | `20260610-034735-9218c2` | 3 | 49,280 | 1,786 | 96.50% | Native + ReasoniX |
| Codebase Architecture Audit | `20260610-035735-72e1e5` | 4 | 79,376 | 11,185 | 87.65% | Native + ReasoniX |
| Policy / Legal Conflict Mining | `20260610-035248-ea5db5` | 5 | 22,400 | 2,829 | 88.79% | ReasoniX |
| Multi-City Deep Research | `20260610-035411-b59808` | 7 | 31,360 | 5,464 | 85.16% | ReasoniX |
| Web/CDP Evidence Extraction | `20260610-035558-9eab49` | 4 | 17,920 | 2,950 | 85.86% | ReasoniX / CDP-ready |

总体：

```text
hit_rate = 200,336 / (200,336 + 24,214) = 89.22%
```

## 3. 关键发现

### 3.1 Native C-FDW 的缓存表现很强

Native C-FDW agent 接入完整 Repomix prefix 后，warm run 中多次达到 99% 左右缓存命中。

典型结果：

```text
agent_7963e75266ea41ffa4 hit_rate = 99.60%
agent_9b02d97d786eaf442b hit_rate = 99.65%
```

这证明大块稳定 prefix 对 DeepSeek prompt cache 有直接收益。

### 3.2 ReasoniX 需要 compact stable prefix

ReasoniX `run` 没有 prompt-file 参数，如果直接把完整 Repomix prefix 作为命令行参数传入，在 Windows 下会触发：

```text
spawn ENAMETOOLONG
```

已修复为：

```text
--prefix-file <path>
--prefix-max-chars 12000
```

wrapper 读取完整 prefix，生成稳定 compact prefix：

```text
C_FDW_PREFIX_SHA256: <sha256>
C_FDW_PREFIX_COMPACTED_CHARS: 12000
<prefix first 12000 chars>
```

这样既保留足够长的稳定可缓存前缀，又避免 Windows argv 长度限制。

### 3.3 综合阶段是命中率下降的主要来源

fan-out 阶段的 ReasoniX agents 通常可以达到 95-97%：

```text
policy extraction agents: 96.18% - 96.32%
multi-city research agents: 96.24% - 96.32%
web/cdp playbook agents: 95.93% - 96.05%
```

但 synthesis / comparison agent 经常下降：

```text
multi-city comparison: 50.28%
web evidence protocol: 65.19%
policy conflict verifier: 67.77%
```

原因是 synthesis prompt 直接拼接了上游 agent 的自然语言输出。这些输出每次不同，会形成跨阶段 prompt drift。

工程结论：

```text
下一步必须把跨阶段传输从 stdout 拼接升级为 artifact manifest + structured JSON。
```

### 3.4 ReasoniX harness 行为需要系统提示约束

第一次代码库审计 demo 中，ReasoniX 曾输出 `run_skill` 伪调用，而不是直接完成任务。已通过 wrapper 默认 system prompt 收紧：

```text
Do not emit run_skill blocks, tool-call markup, commands for the host to run,
or instructions for another agent.
```

重跑后 ReasoniX 能直接输出架构审计报告。

### 3.5 Transcript 解析已加固

代码库审计 demo 提醒：ReasoniX transcript 可能存在坏 JSONL 行或缺失 usage。已实现：

1. 非法 JSONL 行跳过并输出 warning。
2. 缺失 usage 的 transcript entry 不进入 usage ledger。
3. usage 仍然由系统解析 transcript，不依赖 agent 自述。

## 4. Demo 覆盖面

### Demo A: Cache ROI Benchmark

验证：

1. Native 和 ReasoniX 可在同一 ODW workflow 中混用。
2. 稳定 prefix 能把 warm cache hit 提升到 90%+。
3. ReasoniX synthesis 单点命中率仍受可变上游输出影响。

### Demo B: Codebase Architecture Audit

验证：

1. Native agents 适合读代码文件、检查 session/ledger/dashboard。
2. ReasoniX agents 适合架构审查和发布风险综合。
3. demo 能发现真实工程问题并推动修复。

### Demo C: Policy / Legal Conflict Mining

验证：

1. ReasoniX 多 agent 能做规则抽取、阈值识别、冲突 hook 分析。
2. synthesis agent 能按义务类型聚合并给出高/中/低置信度。
3. 整体命中率 88.79%，适合政策/法律研究类 demo。

### Demo D: Multi-City Deep Research

验证：

1. ReasoniX 可按城市/领域 fan-out。
2. 各 city/domain agent 能产出证据表 schema 和风险信号。
3. comparison agent 能生成跨城市比较轴和报告大纲。
4. 该 demo 显示 synthesis prompt drift 的成本，需要 artifact 化。

### Demo E: Web/CDP Evidence Extraction

验证：

1. 当前版本可完成 CDP-ready 浏览器证据 playbook。
2. 输出包含浏览器动作、DOM 字段、截图、下载物、失败恢复策略。
3. 下一阶段接入真实 CDP 后，可直接把这些协议变成执行 artifact。

## 5. 当前发布判断

已达标：

1. GitHub 项目发布骨架。
2. 非商用源码许可。
3. README 中英文定位与项目图片。
4. 架构图视觉资产。
5. ODW mixed adapter。
6. Native + ReasoniX 真实 demo suite。
7. 5 个 demo 的 warm cache 综合命中率 89.22%。
8. ReasoniX wrapper artifact manifest 初版。

仍需继续：

1. Dashboard 支持 `--run-id` / `--since`，避免同 tag 多次 run 混在一起。
2. Dashboard 读取 `artifact-manifest.json` 并展示 artifact panel。
3. 将 synthesis 阶段从拼接自然语言改为读取结构化 artifact。
4. 接入真实 CDP browser executor，而不仅是 CDP-ready protocol demo。
5. 增加自动化 demo runner，避免手动逐个运行。

## 6. 发布建议

当前可以作为 `v0.1.0-alpha` 开源发布候选，但 README 需要明确：

```text
Web/CDP demo 当前是 CDP-ready protocol demo，不是 live browser execution。
Artifact-aware adapter 已有 ReasoniX manifest 初版，但 dashboard artifact panel 尚未完成。
```

如果要作为更完整的 v0.1.0 发布，建议先完成 dashboard artifact panel 和 run-id 过滤。
