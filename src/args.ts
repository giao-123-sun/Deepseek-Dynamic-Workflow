import path from "node:path";
import type { AgentCliOptions } from "./types.js";

const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_PRO_MODEL = "deepseek-v4-pro";
const DEFAULT_BASE_URL = "https://api.deepseek.com";

export function parseArgs(argv: string[]): AgentCliOptions {
  const values = new Map<string, string | boolean>();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    if (key === "dry-run" || key === "help") {
      values.set(key, true);
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    values.set(key, next);
    i += 1;
  }

  if (values.get("help")) {
    throw new HelpRequested();
  }

  const cwd = path.resolve(String(values.get("cwd") ?? process.cwd()));
  const prompt = getOptional(values, "prompt");
  const promptFile = resolveOptional(cwd, getOptional(values, "prompt-file"));
  const prefixFile = resolveOptional(cwd, getOptional(values, "prefix-file"));
  const schemaFile = resolveOptional(cwd, getOptional(values, "schema-file"));
  const outDir = resolveOptional(cwd, getOptional(values, "out-dir"));
  const cacheGroupId = required(values, "cache-group-id");
  const sessionId = getOptional(values, "session-id") ?? "auto";

  if (sessionId !== "auto") {
    sanitizeId(sessionId, "session-id");
  }

  if (!prompt && !promptFile) {
    throw new Error("Provide either --prompt or --prompt-file.");
  }

  return {
    cwd,
    prompt,
    promptFile,
    prefixFile,
    cacheGroupId,
    sessionId,
    schemaFile,
    outDir,
    model: String(values.get("model") ?? DEFAULT_MODEL),
    proModel: String(values.get("pro-model") ?? DEFAULT_PRO_MODEL),
    maxTurns: parsePositiveInt(String(values.get("max-turns") ?? "6"), "max-turns"),
    temperature: parseNumber(String(values.get("temperature") ?? "0.2"), "temperature"),
    baseUrl: String(values.get("base-url") ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    dryRun: Boolean(values.get("dry-run"))
  };
}

export class HelpRequested extends Error {}

export function usage(): string {
  return [
    "Usage:",
    "  ddw-agent --cwd <workspace> --prompt <text> --cache-group-id <id> [--session-id <id|auto>] [options]",
    "  ddw-agent --cwd <workspace> --prompt-file <file> --cache-group-id <id> [--session-id <id|auto>] [options]",
    "  cf-dw-agent remains available as a legacy alias.",
    "",
    "Options:",
    "  --session-id <id|auto>    Default: auto.",
    "  --prefix-file <file>       Stable immutable prefix file.",
    "  --schema-file <file>       Optional output schema text injected into the contract.",
    "  --out-dir <dir>            Artifact directory. Default: <cwd>/.cf-dw/runs/<session-id>.",
    "  --model <name>             Default: deepseek-v4-flash.",
    "  --pro-model <name>         Default: deepseek-v4-pro.",
    "  --max-turns <n>            Default: 6.",
    "  --temperature <n>          Default: 0.2.",
    "  --base-url <url>           Default: https://api.deepseek.com.",
    "  --dry-run                  Create local artifacts without calling DeepSeek.",
    "  --help                     Show this help."
  ].join("\n");
}

function required(values: Map<string, string | boolean>, key: string): string {
  const value = values.get(key);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${key}`);
  }
  return sanitizeId(value, key);
}

function getOptional(values: Map<string, string | boolean>, key: string): string | undefined {
  const value = values.get(key);
  return typeof value === "string" ? value : undefined;
}

function resolveOptional(cwd: string, value: string | undefined): string | undefined {
  if (!value) return undefined;
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}

function parsePositiveInt(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return parsed;
}

function parseNumber(value: string, name: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${name} must be a number.`);
  }
  return parsed;
}

function sanitizeId(value: string, name: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(`--${name} must match [a-zA-Z0-9_-]+ for DeepSeek user_id compatibility.`);
  }
  if (value.length > 512) {
    throw new Error(`--${name} must be at most 512 characters.`);
  }
  return value;
}
