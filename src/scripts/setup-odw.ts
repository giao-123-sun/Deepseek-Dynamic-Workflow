#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

interface SetupOdwArgs {
  cwd: string;
  repo: string;
  target: string;
  ref: string;
  ifMissing: boolean;
  update: boolean;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const target = path.resolve(args.cwd, args.target);
  const cliPath = path.join(target, "dist", "cli.js");
  const npmCache = path.join(args.cwd, ".cf-dw", "npm-cache");

  if (args.ifMissing && existsSync(cliPath)) {
    process.stdout.write(`[ddw-setup-odw] ODW already available: ${cliPath}\n`);
    return;
  }

  mkdirSync(path.dirname(target), { recursive: true });
  mkdirSync(npmCache, { recursive: true });

  if (!existsSync(target)) {
    await runCommand(["git", "clone", "--depth", "1", "--branch", args.ref, args.repo, target], args.cwd);
  } else if (args.update) {
    await runCommand(["git", "fetch", "origin", args.ref, "--depth", "1"], target);
    await runCommand(["git", "checkout", args.ref], target);
    await runCommand(["git", "pull", "--ff-only", "origin", args.ref], target);
  }

  if (!existsSync(path.join(target, "package.json"))) {
    throw new Error(`ODW target does not look like a Node project: ${target}`);
  }

  await runCommand(["npm", "install"], target, npmEnv(npmCache));
  await runCommand(["npm", "run", "build"], target, npmEnv(npmCache));

  if (!existsSync(cliPath)) {
    throw new Error(`ODW build did not create ${cliPath}`);
  }

  process.stdout.write(`[ddw-setup-odw] ODW CLI ready: ${cliPath}\n`);
}

function parseArgs(argv: string[]): SetupOdwArgs {
  const values = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--help") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (key === "--if-missing" || key === "--update") {
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
  return {
    cwd,
    repo: String(values.get("repo") ?? "https://github.com/xz1220/open-dynamic-workflows.git"),
    target: String(values.get("target") ?? ".cf-dw/vendor/open-dynamic-workflows"),
    ref: String(values.get("ref") ?? "main"),
    ifMissing: Boolean(values.get("if-missing")),
    update: Boolean(values.get("update"))
  };
}

function usage(): string {
  return [
    "Usage:",
    "  ddw-setup-odw [options]",
    "  cf-dw-setup-odw remains available as a legacy alias.",
    "",
    "Options:",
    "  --cwd <dir>       DDW project directory. Default: current directory.",
    "  --repo <url>      ODW git repository. Default: https://github.com/xz1220/open-dynamic-workflows.git.",
    "  --target <dir>    Install target. Default: .cf-dw/vendor/open-dynamic-workflows.",
    "  --ref <ref>       Git branch/tag/ref. Default: main.",
    "  --if-missing      Exit early when the built ODW CLI already exists.",
    "  --update          Fetch and fast-forward an existing checkout.",
    "  --help            Show help."
  ].join("\n");
}

function npmEnv(cachePath: string): Record<string, string> {
  return {
    npm_config_cache: cachePath,
    NPM_CONFIG_CACHE: cachePath
  };
}

function runCommand(command: string[], cwd: string, envOverrides: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(`[ddw-setup-odw] ${command.join(" ")}\n`);
    const child = spawn(command[0]!, command.slice(1), {
      cwd,
      env: { ...process.env, ...envOverrides },
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command exited with code ${code}: ${command.join(" ")}`));
    });
  });
}

await main();
