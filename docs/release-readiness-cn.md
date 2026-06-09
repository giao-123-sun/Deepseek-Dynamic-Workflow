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
13. Dashboard artifact preview panel，可展开预览文本类 artifact。
14. Demo suite runner：`npm run demo:run` / `npm run demo:dashboards`。
15. Release audit runner：`npm run release:audit`。
16. Demo structured handoff：`cf-dw.structured-handoff.v1`，并由 release audit 检查。
17. Release pack runner：`npm run release:pack`，使用 `git archive HEAD` 生成源码发布包。
18. GitHub tag source archive workflow：`.github/workflows/release-source.yml`。
19. GitHub release notes：`docs/releases/v0.1.0-alpha.md`。

## 本地验证

```text
npm run check: pass
npm run build: pass
npm run release:audit: pass
npm run release:pack: pass after tracked worktree is clean
dashboard localhost check: pass
```

Demo suite：

```text
demos        = 5
agents       = 23
reasonix     = 20 agents
cache hit    = 202,880
cache miss   = 27,142
hit rate     = 88.20%
```

## 发布前仍建议完成

1. 将本地 Git 仓库推送到 GitHub remote。
2. 在 GitHub README 中确认图片路径 `assets/*.png` 正常显示。
3. 推送 `v0.1.0-alpha` tag，并确认 `release-source` workflow 上传源码包 artifact。
4. 将跨阶段 synthesis prompt 从 structured handoff 升级为直接读取结构化 `artifact-manifest.json`。
5. 接入真实 CDP browser executor。
6. Dashboard 增加图片/截图 artifact 缩略图预览。

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
ReasoniX backends. The five demo workflows reached 88.20% aggregate warm-cache
hit rate in local release audit.
```

## 不能在 CI 中做的事

CI 不应运行 live DeepSeek demo，因为需要私有 `DEEPSEEK_API_KEY`，并且会产生 API 成本。
Live demo benchmark 应作为手动 release checklist 执行。
