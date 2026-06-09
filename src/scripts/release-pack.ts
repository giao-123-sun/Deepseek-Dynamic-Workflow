#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir, writeTextFile } from "../fs-utils.js";

interface ReleasePackArgs {
  cwd: string;
  tag: string;
  outputDir: string;
  skipDashboards: boolean;
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));
    await runReleasePack(args);
  } catch (error) {
    process.stderr.write(`[c-fdw-release-pack] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

async function runReleasePack(args: ReleasePackArgs): Promise<void> {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  await runCommand([npm, "run", "check"], args.cwd);
  await runCommand([npm, "run", "build"], args.cwd);
  await runCommand([npm, "run", "release:audit"], args.cwd);
  if (!args.skipDashboards) {
    await runCommand([npm, "run", "demo:dashboards"], args.cwd);
  }
  await runCommand(["git", "diff", "--check"], args.cwd);

  const dirty = (await captureCommand(["git", "status", "--porcelain", "--untracked-files=no"], args.cwd)).trim();
  if (dirty) {
    throw new Error([
      "Tracked worktree changes are present. Commit or revert tracked changes before packing.",
      dirty
    ].join("\n"));
  }

  const commit = (await captureCommand(["git", "rev-parse", "--short=12", "HEAD"], args.cwd)).trim();
  const outputDir = path.resolve(args.cwd, args.outputDir);
  await ensureDir(outputDir);
  const archiveName = `cf-dw-${args.tag}-${commit}.zip`;
  const archivePath = path.join(outputDir, archiveName);
  const prefix = `cf-dw-${args.tag}/`;
  await runCommand(["git", "archive", "--format=zip", "--output", archivePath, `--prefix=${prefix}`, "HEAD"], args.cwd);

  const bytes = await readFile(archivePath);
  const manifest = {
    version: "cf-dw.release-pack.v1",
    tag: args.tag,
    commit,
    archive: archiveName,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    generatedAt: new Date().toISOString(),
    source: "git archive HEAD",
    excludes: [".env", ".cf-dw/", ".odw/", "dist/", "node_modules/"]
  };
  const manifestPath = path.join(outputDir, `cf-dw-${args.tag}-${commit}.manifest.json`);
  await writeTextFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  process.stdout.write([
    "CFDW release pack created",
    `archive=${archivePath}`,
    `manifest=${manifestPath}`,
    `commit=${commit}`,
    `sha256=${manifest.sha256}`,
    ""
  ].join("\n"));
}

function parseArgs(argv: string[]): ReleasePackArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--help") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (key === "--skip-dashboards") {
      flags.add("skip-dashboards");
      continue;
    }

    const value = argv[i + 1];
    if (!key.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    values.set(key.slice(2), value);
    i += 1;
  }

  return {
    cwd: path.resolve(values.get("cwd") ?? process.cwd()),
    tag: values.get("tag") ?? "v0.1.0-alpha",
    outputDir: values.get("output-dir") ?? path.join(".cf-dw", "release"),
    skipDashboards: flags.has("skip-dashboards")
  };
}

function usage(): string {
  return [
    "Usage:",
    "  cf-dw-release-pack --tag v0.1.0-alpha",
    "",
    "Options:",
    "  --cwd <dir>            Default: current directory.",
    "  --tag <name>           Default: v0.1.0-alpha.",
    "  --output-dir <dir>     Default: .cf-dw/release.",
    "  --skip-dashboards      Skip regenerating latest demo dashboards.",
    "  --help                 Show help."
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

function captureCommand(command: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0]!, command.slice(1), {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`Command exited with code ${code}: ${command.join(" ")}\n${stderr}`));
    });
  });
}

await main();
