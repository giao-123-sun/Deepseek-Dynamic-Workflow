#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileExists, readTextFile, sha256, writeTextFile } from "./fs-utils.js";
import { stableStringify } from "./stable-json.js";

interface PrefixArgs {
  cwd: string;
  output: string;
  style: "xml" | "markdown" | "json" | "plain";
  include?: string;
  ignore: string;
  compress: boolean;
  removeComments: boolean;
  removeEmptyLines: boolean;
  repomixBin?: string;
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));
    await buildPrefix(args);
  } catch (error) {
    process.stderr.write(`[c-fdw-prefix] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

async function buildPrefix(args: PrefixArgs): Promise<void> {
  const repomixBin = args.repomixBin ?? (await resolveLocalRepomixBin());
  const outputPath = path.isAbsolute(args.output) ? args.output : path.resolve(args.cwd, args.output);
  const repomixArgs = [
    args.cwd,
    "--quiet",
    "--output",
    outputPath,
    "--style",
    args.style,
    "--no-git-sort-by-changes",
    "--ignore",
    args.ignore
  ];

  if (args.include) repomixArgs.push("--include", args.include);
  if (args.compress) repomixArgs.push("--compress");
  if (args.removeComments) repomixArgs.push("--remove-comments");
  if (args.removeEmptyLines) repomixArgs.push("--remove-empty-lines");

  await run(repomixBin, repomixArgs);

  const content = await readTextFile(outputPath);
  const manifest = {
    command: "cf-dw-prefix",
    output: path.relative(args.cwd, outputPath).split(path.sep).join("/"),
    output_sha256: sha256(content),
    options: {
      compress: args.compress,
      ignore: args.ignore,
      include: args.include ?? null,
      removeComments: args.removeComments,
      removeEmptyLines: args.removeEmptyLines,
      style: args.style
    },
    repomixBin: path.basename(repomixBin)
  };

  const manifestPath = `${outputPath}.manifest.json`;
  await writeTextFile(manifestPath, `${stableStringify(manifest)}\n`);

  process.stdout.write(`prefix=${outputPath}\n`);
  process.stdout.write(`manifest=${manifestPath}\n`);
  process.stdout.write(`sha256=${manifest.output_sha256}\n`);
}

function parseArgs(argv: string[]): PrefixArgs {
  const values = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);

    if (["compress", "remove-comments", "remove-empty-lines", "help"].includes(key)) {
      values.set(key, true);
      continue;
    }

    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    values.set(key, value);
    i += 1;
  }

  if (values.get("help")) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }

  const cwd = path.resolve(String(values.get("cwd") ?? process.cwd()));
  const style = String(values.get("style") ?? "xml");
  if (!["xml", "markdown", "json", "plain"].includes(style)) {
    throw new Error("--style must be xml, markdown, json, or plain.");
  }

  return {
    cwd,
    output: String(values.get("output") ?? ".cf-dw/prefix/cache-prefix.xml"),
    style: style as PrefixArgs["style"],
    include: optionalString(values.get("include")),
    ignore: String(
      values.get("ignore") ??
        ".cf-dw/**,node_modules/**,dist/**,.npm-cache/**,reports/rendered-*/**,reports/*.pdf,reports/*.docx"
    ),
    compress: Boolean(values.get("compress")),
    removeComments: Boolean(values.get("remove-comments")),
    removeEmptyLines: Boolean(values.get("remove-empty-lines")),
    repomixBin: optionalString(values.get("repomix-bin"))
  };
}

function usage(): string {
  return [
    "Usage:",
    "  cf-dw-prefix --cwd <workspace> [options]",
    "",
    "Options:",
    "  --output <file>          Default: .cf-dw/prefix/cache-prefix.xml",
    "  --style <type>           xml, markdown, json, plain. Default: xml.",
    "  --include <patterns>     Comma-separated include patterns.",
    "  --ignore <patterns>      Comma-separated ignore patterns.",
    "  --compress               Use Repomix Tree-sitter compression.",
    "  --remove-comments        Strip comments.",
    "  --remove-empty-lines     Strip empty lines.",
    "  --repomix-bin <path>     Custom Repomix binary.",
    "  --help                   Show help."
  ].join("\n");
}

async function resolveLocalRepomixBin(): Promise<string> {
  const distDir = dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(distDir, "..");
  const binaryName = process.platform === "win32" ? "repomix.cmd" : "repomix";
  const localBin = path.join(packageRoot, "node_modules", ".bin", binaryName);
  if (await fileExists(localBin)) return localBin;

  return process.platform === "win32" ? "repomix.cmd" : "repomix";
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "inherit", "inherit"],
      shell: process.platform === "win32"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} exited with code ${code ?? "unknown"}`));
    });
  });
}

function optionalString(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

await main();
