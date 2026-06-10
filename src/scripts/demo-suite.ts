#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";

interface DemoSpec {
  name: string;
  tag: string;
  script: string;
  dashboard: string;
}

const DEMOS: DemoSpec[] = [
  {
    name: "cache-roi-benchmark",
    tag: "demo-cache-roi-benchmark",
    script: "examples/demos/cache-roi-benchmark.js",
    dashboard: "demo-cache-roi-benchmark-latest.html"
  },
  {
    name: "codebase-architecture-audit",
    tag: "demo-codebase-architecture-audit",
    script: "examples/demos/codebase-architecture-audit.js",
    dashboard: "demo-codebase-architecture-audit-latest.html"
  },
  {
    name: "policy-conflict-mining",
    tag: "demo-policy-conflict-mining",
    script: "examples/demos/policy-conflict-mining.js",
    dashboard: "demo-policy-conflict-mining-latest.html"
  },
  {
    name: "multi-city-deep-research",
    tag: "demo-multi-city-deep-research",
    script: "examples/demos/multi-city-deep-research.js",
    dashboard: "demo-multi-city-deep-research-latest.html"
  },
  {
    name: "web-cdp-evidence-extraction",
    tag: "demo-web-cdp-evidence-extraction",
    script: "examples/demos/web-cdp-evidence-extraction.js",
    dashboard: "demo-web-cdp-evidence-extraction-latest.html"
  }
];

interface DemoSuiteArgs {
  cwd: string;
  mode: "list" | "dashboards" | "run";
  odwCli: string;
  config: string;
  runsRoot: string;
  reportsDir: string;
  timeout: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.mode === "list") {
    for (const demo of DEMOS) {
      process.stdout.write(`${demo.name}\t${demo.tag}\t${demo.script}\n`);
    }
    return;
  }

  if (args.mode === "run") {
    for (const demo of DEMOS) {
      process.stdout.write(`\n[c-fdw-demo-suite] running ${demo.name}\n`);
      await runCommand([
        process.execPath,
        args.odwCli,
        "run",
        path.join(args.cwd, demo.script),
        "--config",
        args.config,
        "--runs-root",
        args.runsRoot,
        "--wait",
        "--timeout",
        args.timeout
      ], args.cwd);
    }
  }

  for (const demo of DEMOS) {
    process.stdout.write(`[c-fdw-demo-suite] dashboard ${demo.name}\n`);
    await runCommand([
      process.execPath,
      path.join(args.cwd, "dist", "dashboard.js"),
      "--runs-root",
      path.join(args.cwd, ".cf-dw", "runs"),
      "--workflow-tag",
      demo.tag,
      "--latest-per-agent",
      "--output",
      path.join(args.reportsDir, demo.dashboard)
    ], args.cwd);
  }
}

function parseArgs(argv: string[]): DemoSuiteArgs {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--help") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    const value = argv[i + 1];
    if (!key.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    values.set(key.slice(2), value);
    i += 1;
  }

  const cwd = path.resolve(values.get("cwd") ?? process.cwd());
  const mode = (values.get("mode") ?? "dashboards") as DemoSuiteArgs["mode"];
  if (!["list", "dashboards", "run"].includes(mode)) {
    throw new Error("--mode must be list, dashboards, or run.");
  }

  return {
    cwd,
    mode,
    odwCli: path.resolve(cwd, values.get("odw-cli") ?? "../open-dynamic-workflows/dist/cli.js"),
    config: path.resolve(cwd, values.get("config") ?? "odw.mixed.config.json"),
    runsRoot: path.resolve(cwd, values.get("runs-root") ?? ".odw/runs"),
    reportsDir: path.resolve(cwd, values.get("reports-dir") ?? ".cf-dw/reports"),
    timeout: values.get("timeout") ?? "1200"
  };
}

function usage(): string {
  return [
    "Usage:",
    "  ddw-demo-suite --mode list",
    "  ddw-demo-suite --mode dashboards",
    "  ddw-demo-suite --mode run --odw-cli ../open-dynamic-workflows/dist/cli.js",
    "  cf-dw-demo-suite remains available as a legacy alias.",
    "",
    "Options:",
    "  --mode <list|dashboards|run>  Default: dashboards.",
    "  --cwd <dir>                   Default: current directory.",
    "  --odw-cli <file>              Default: ../open-dynamic-workflows/dist/cli.js.",
    "  --config <file>               Default: odw.mixed.config.json.",
    "  --runs-root <dir>             Default: .odw/runs.",
    "  --reports-dir <dir>           Default: .cf-dw/reports.",
    "  --timeout <seconds>           Default: 1200."
  ].join("\n");
}

function runCommand(command: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0]!, command.slice(1), {
      cwd,
      env: process.env,
      stdio: "inherit",
      shell: false
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command exited with code ${code}: ${command.join(" ")}`));
    });
  });
}

await main();
