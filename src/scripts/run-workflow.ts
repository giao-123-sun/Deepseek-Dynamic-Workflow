#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface RunWorkflowArgs {
  cwd: string;
  script: string;
  config: string;
  odwCli: string;
  runsRoot: string;
  ddwRunsRoot: string;
  output: string;
  workflowTag?: string;
  timeout: string;
  port: string;
  host: string;
  open: boolean;
  live: boolean;
  selfEvolve: boolean;
  latestPerAgent: boolean;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await setupOdw(args.cwd);

  if (args.live) {
    startLiveDashboard(args);
  }

  await runCommand([
    process.execPath,
    args.odwCli,
    "run",
    args.script,
    "--config",
    args.config,
    "--runs-root",
    args.runsRoot,
    "--wait",
    "--timeout",
    args.timeout
  ], args.cwd);

  if (args.workflowTag) {
    await runCommand([
      process.execPath,
      path.join(args.cwd, "dist", "dashboard.js"),
      "--runs-root",
      args.ddwRunsRoot,
      "--workflow-tag",
      args.workflowTag,
      ...(args.latestPerAgent ? ["--latest-per-agent"] : []),
      "--output",
      args.output
    ], args.cwd);

    if (args.selfEvolve) {
      await runCommand([
        process.execPath,
        path.join(args.cwd, "dist", "scripts", "self-evolve.js"),
        "--runs-root",
        args.ddwRunsRoot,
        "--workflow-tag",
        args.workflowTag,
        ...(args.latestPerAgent ? ["--latest-per-agent"] : [])
      ], args.cwd);
    }
  }
}

function parseArgs(argv: string[]): RunWorkflowArgs {
  const values = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--help") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (["--no-open", "--no-live", "--no-self-evolve", "--latest-per-agent"].includes(key)) {
      values.set(key.slice(2), true);
      continue;
    }
    const value = argv[i + 1];
    if (!key.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    values.set(key.slice(2), value);
    i += 1;
  }

  const cwd = path.resolve(String(values.get("cwd") ?? process.cwd()));
  const workflowTag = typeof values.get("workflow-tag") === "string" ? String(values.get("workflow-tag")) : undefined;
  const output = String(values.get("output") ?? `.cf-dw/reports/${workflowTag ?? "workflow"}-latest.html`);
  const script = values.get("script");
  if (typeof script !== "string") throw new Error("Missing required --script <workflow.js>.");

  return {
    cwd,
    script: path.resolve(cwd, script),
    config: path.resolve(cwd, String(values.get("config") ?? "odw.mixed.config.json")),
    odwCli: path.resolve(cwd, String(values.get("odw-cli") ?? ".cf-dw/vendor/open-dynamic-workflows/dist/cli.js")),
    runsRoot: path.resolve(cwd, String(values.get("runs-root") ?? ".odw/runs")),
    ddwRunsRoot: path.resolve(cwd, String(values.get("ddw-runs-root") ?? ".cf-dw/runs")),
    output: path.resolve(cwd, output),
    workflowTag,
    timeout: String(values.get("timeout") ?? "1200"),
    port: String(values.get("port") ?? "4317"),
    host: String(values.get("host") ?? "127.0.0.1"),
    open: !values.has("no-open"),
    live: !values.has("no-live"),
    selfEvolve: !values.has("no-self-evolve"),
    latestPerAgent: true
  };
}

function usage(): string {
  return [
    "Usage:",
    "  ddw-workflow-run --script <workflow.js> --workflow-tag <tag> [options]",
    "",
    "Options:",
    "  --cwd <dir>             Default: current directory.",
    "  --script <file>         ODW workflow script.",
    "  --config <file>         Default: odw.mixed.config.json.",
    "  --odw-cli <file>        Default: .cf-dw/vendor/open-dynamic-workflows/dist/cli.js.",
    "  --workflow-tag <tag>    Generate DDW dashboard/self-evolve for this tag.",
    "  --runs-root <dir>       ODW run root. Default: .odw/runs.",
    "  --ddw-runs-root <dir>   DDW run root. Default: .cf-dw/runs.",
    "  --output <file>         Dashboard output. Default: .cf-dw/reports/<tag>-latest.html.",
    "  --timeout <seconds>     Default: 1200.",
    "  --port <n>              Live ODW dashboard port. Default: 4317.",
    "  --host <addr>           Live ODW dashboard host. Default: 127.0.0.1.",
    "  --no-open               Start live server without opening browser.",
    "  --no-live               Do not start ODW live dashboard.",
    "  --no-self-evolve        Do not generate self-evolve report after the run.",
    "  --help                  Show help."
  ].join("\n");
}

async function setupOdw(cwd: string): Promise<void> {
  const selfDir = path.dirname(fileURLToPath(import.meta.url));
  await runCommand([process.execPath, path.join(selfDir, "setup-odw.js"), "--if-missing"], cwd);
}

function startLiveDashboard(args: RunWorkflowArgs): void {
  const command = [
    process.execPath,
    args.odwCli,
    "serve",
    "--runs-root",
    args.runsRoot,
    "--host",
    args.host,
    "--port",
    args.port,
    ...(args.open ? ["--open"] : [])
  ];

  const child = spawn(command[0]!, command.slice(1), {
    cwd: args.cwd,
    env: process.env,
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  process.stdout.write(`live_dashboard=http://${args.host}:${args.port}\n`);
}

function runCommand(command: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(`[ddw-workflow-run] ${command.join(" ")}\n`);
    const child = spawn(command[0]!, command.slice(1), {
      cwd,
      env: process.env,
      stdio: "inherit",
      shell: false,
      windowsHide: true
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command exited with code ${code}: ${command.join(" ")}`));
    });
  });
}

await main();
