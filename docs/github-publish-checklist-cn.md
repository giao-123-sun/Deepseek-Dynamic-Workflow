# DDW GitHub 发布执行清单

**日期**：2026-06-10
**本地路径**：`C:/Users/admin/Documents/agioa/agent_more/cf-dw`
**当前分支**：`main`
**当前提交确认命令**：`git log --oneline -1`

## 1. 目标逐项审计

| 要求 | 当前状态 | 证据 |
|---|---|---|
| 完整动态工作流项目 | 已完成本地发布候选 | `package.json`、`src/`、`examples/demos/`、`odw*.config.json` |
| GitHub 项目骨架 | 已完成本地仓库，未推 remote | `git log --oneline -1` 可看到本地发布提交 |
| 非商用、保留商用授权 | 已完成 | `LICENSE.md`、`NOTICE.md` |
| README 首屏项目定位 | 已完成 | `README.md` 的 `Project Positioning / 项目定位` |
| README 项目图片 | 已完成 | `assets/cf-dw-hero.png`、`assets/cf-dw-architecture.png` |
| 架构图视觉资产 | 已完成 | `assets/cf-dw-architecture.png` |
| ODW custom adapter 形态 | 已完成 | `odw.config.json`、`odw.reasonix.config.json`、`odw.mixed.config.json` |
| DeepSeek cache-first 接入 | 已完成 | `src/DeepSeek-client.ts`、`src/usage-ledger.ts`、`src/prefix-builder.ts` |
| ReasoniX 多步 agent harness | 已完成 | `src/reasonix-agent.ts`、`examples/demos/*` |
| 跨阶段结构化 handoff | 已完成 | demo 源码包含 `cf-dw.structured-handoff.v1`，由 `npm run release:audit` 检查 |
| 5 个 demo 实测 | 已完成 | `docs/demo-benchmark-report-cn.md` |
| 缓存命中 80%-90%+ | 已完成 | `npm run release:audit` 汇总命中率 `88.20%` |
| Dashboard 可视化 | 已完成 artifact preview 版 | `src/dashboard.ts`、`src/workflow-view.ts` |
| Release audit | 已完成 | `src/scripts/release-audit.ts`、`npm run release:audit` |
| Release pack | 已完成 | `src/scripts/release-pack.ts`、`npm run release:pack` |
| GitHub CI | 已完成 | `.github/workflows/ci.yml` |
| GitHub tag source archive | 已完成 | `.github/workflows/release-source.yml` |
| Release notes | 已完成 | `docs/releases/v0.1.0-alpha.md` |
| 私钥不入仓库 | 已检查 | `.env` 被 `.gitignore` 忽略，`.env.example` 只有占位符 |

## 2. 已执行的本地验证

```text
npm run build  pass
npm run check  pass
npm run release:audit  pass
npm run release:pack  pass after tracked worktree is clean
git diff --cached --check  pass before commit
dashboard artifact preview desktop  pass, no horizontal overflow
dashboard artifact preview mobile   pass, no horizontal overflow
```

5 个 demo 的 warm-run 汇总：

```text
demos        = 5
agents       = 23
reasonix     = 20 agents
cache hit    = 202,880 tokens
cache miss   = 27,142 tokens
hit rate     = 88.20%
```

## 3. 当前不能自动完成的外部步骤

当前 shell 中没有可用的 GitHub 发布凭据：

```text
gh CLI       = not installed
GITHUB_TOKEN = unset
GH_TOKEN     = unset
SSH_AUTH_SOCK = unset
git remote   = not configured
```

因此，当前状态是：

```text
local release candidate = ready
published on GitHub     = not yet
```

## 4. 拿到 GitHub 仓库 URL 后执行

假设 GitHub 仓库为：

```text
https://github.com/<owner>/cf-dw.git
```

执行：

```bash
git remote add origin https://github.com/<owner>/cf-dw.git
git push -u origin main
npm run release:pack
git tag v0.1.0-alpha
git push origin v0.1.0-alpha
```

如果 Git Credential Manager 弹出浏览器登录，完成 GitHub 授权后再重试 push。

`v0.1.0-alpha` tag 推送后，GitHub 会运行 `release-source` workflow，上传源码 zip 与 manifest artifact。这个 workflow 不运行 live DeepSeek demo；live demo 仍以 `npm run release:audit` 的本地审计结果为发布依据。

## 5. GitHub 页面发布后检查

1. README 顶部 `assets/cf-dw-hero.png` 正常显示。
2. README 架构图 `assets/cf-dw-architecture.png` 正常显示。
3. License 页显示非商用许可。
4. GitHub Actions 的 `CI` workflow 能运行 `npm ci`、`npm run build`、`npm run check`。
5. GitHub Actions 的 `release-source` workflow 能在 tag 上上传 source archive artifact。
6. GitHub Release 文案可以使用 `docs/releases/v0.1.0-alpha.md`。
7. README 中 demo 指标和 `docs/demo-benchmark-report-cn.md` 一致。

## 6. Alpha 发布说明建议

```text
DDW v0.1.0-alpha is a non-commercial source-available release candidate.
It demonstrates cache-first dynamic workflows on Open Dynamic Workflows with
Native DDW and ReasoniX harness backends. The five verified demo workflows
reached 88.20% aggregate warm-cache hit rate in local DeepSeek release audit.
```

## 7. 后续工程路线

1. 跨阶段 handoff 从自然语言 stdout 拼接升级为结构化 `artifact-manifest.json`。
2. Web/CDP demo 接入真实 browser executor。
3. Dashboard 增加图片/截图 artifact 缩略图预览。
4. 增加 benchmark JSON 输出和自动阈值门禁。
5. 增加 ReasoniX resumable session / pooled session 实验。
