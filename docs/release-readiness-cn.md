# CFDW GitHub 发布准备说明

**日期**：2026-06-10
**目标版本**：`0.1.0-alpha`

## 已完成

1. README 首屏定位文案，中英文双语。
2. README hero 图和架构视觉图。
3. 非商用源码许可：`LICENSE.md`。
4. Notice 与贡献说明：`NOTICE.md`、`CONTRIBUTING.md`。
5. GitHub CI：`.github/workflows/ci.yml`。
6. ODW mixed adapter config：`odw.mixed.config.json`。
7. 5 个 demo workflow：`examples/demos/`。
8. 5 个 demo 实测 benchmark：`docs/demo-benchmark-report-cn.md`。
9. ReasoniX wrapper artifact manifest 初版。
10. ReasoniX compact prefix，避免 Windows `spawn ENAMETOOLONG`。
11. Dashboard `--since` / `--run-id` / `--latest-per-agent` 过滤。
12. Dashboard artifact chips 与 backend chips。
13. Demo suite runner：`npm run demo:run` / `npm run demo:dashboards`。

## 本地验证

```text
npm run check: pass
npm run build: pass
dashboard localhost check: pass
```

Demo suite：

```text
demos        = 5
agents       = 23
cache hit    = 200,336
cache miss   = 24,214
hit rate     = 89.22%
```

## 发布前仍建议完成

1. 将本地 Git 仓库推送到 GitHub remote。
2. 在 GitHub README 中确认图片路径 `assets/*.png` 正常显示。
3. 将 dashboard 的 artifact chips 升级为完整 artifact panel，可展开预览文本/图片。
4. 将跨阶段 synthesis prompt 从自然语言拼接升级为读取结构化 `artifact-manifest.json`。
5. 接入真实 CDP browser executor。

当前本地仓库状态：

```text
branch        = main
latest commit = use `git log --oneline -1` to verify
remote        = not configured
GitHub auth   = not available in this local shell
```

因此，代码已达到本地发布候选状态，但“已经发布到 GitHub”仍需要配置 remote 并完成 GitHub 登录授权。

## 建议发布措辞

```text
CFDW v0.1.0-alpha is a non-commercial source-available release candidate.
It demonstrates cache-first dynamic workflows on ODW with Native C-FDW and
ReasoniX backends. The five demo workflows reached 89.22% aggregate warm-cache
hit rate in local testing.
```

## 不能在 CI 中做的事

CI 不应运行 live DeepSeek demo，因为需要私有 `DEEPSEEK_API_KEY`，并且会产生 API 成本。
Live demo benchmark 应作为手动 release checklist 执行。
