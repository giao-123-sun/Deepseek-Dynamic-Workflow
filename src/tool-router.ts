import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { sha256, toWorkspaceRelative } from "./fs-utils.js";
import { stableStringify } from "./stable-json.js";
import type { StableToolResult, ToolCall, ToolName } from "./types.js";

const MAX_FILE_BYTES = 60_000;
const MAX_GREP_RESULTS = 50;

export async function dispatchTools(cwd: string, calls: ToolCall[]): Promise<StableToolResult[]> {
  const results: StableToolResult[] = [];

  for (const call of calls) {
    results.push(await dispatchTool(cwd, call));
  }

  return results;
}

async function dispatchTool(cwd: string, call: ToolCall): Promise<StableToolResult> {
  try {
    if (!isToolName(call.tool)) {
      return errorResult(call, `Unknown tool: ${String(call.tool)}`);
    }

    if (call.tool === "list_directory") {
      return await listDirectory(cwd, call);
    }

    if (call.tool === "read_file") {
      return await readFileTool(cwd, call);
    }

    return await grepTool(cwd, call);
  } catch (error) {
    return errorResult(call, error instanceof Error ? error.message : String(error));
  }
}

async function listDirectory(cwd: string, call: ToolCall): Promise<StableToolResult> {
  const inputPath = stringArg(call.args, "path", ".");
  const relative = toWorkspaceRelative(cwd, inputPath);
  const absolute = path.resolve(cwd, relative);
  const entries = await readdir(absolute, { withFileTypes: true });
  const content = entries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`)
    .join("\n");

  return okResult(call, { path: relative }, content);
}

async function readFileTool(cwd: string, call: ToolCall): Promise<StableToolResult> {
  const inputPath = stringArg(call.args, "path");
  const relative = toWorkspaceRelative(cwd, inputPath);
  const maxBytes = numberArg(call.args, "maxBytes", MAX_FILE_BYTES, 1, MAX_FILE_BYTES);
  const absolute = path.resolve(cwd, relative);
  const buffer = await readFile(absolute);
  const sliced = buffer.subarray(0, maxBytes);
  const suffix = buffer.length > maxBytes ? `\n\n[truncated ${buffer.length - maxBytes} bytes]` : "";
  const content = `${sliced.toString("utf8")}${suffix}`;

  return okResult(call, { maxBytes, path: relative }, content);
}

async function grepTool(cwd: string, call: ToolCall): Promise<StableToolResult> {
  const pattern = stringArg(call.args, "pattern");
  const inputPath = stringArg(call.args, "path", ".");
  const relative = toWorkspaceRelative(cwd, inputPath);
  const maxResults = numberArg(call.args, "maxResults", 20, 1, MAX_GREP_RESULTS);
  const root = path.resolve(cwd, relative);
  const regex = new RegExp(pattern, "i");
  const matches: string[] = [];

  await grepWalk(root, cwd, regex, matches, maxResults);

  return okResult(call, { maxResults, path: relative, pattern }, matches.join("\n"));
}

async function grepWalk(
  absolutePath: string,
  cwd: string,
  regex: RegExp,
  matches: string[],
  maxResults: number
): Promise<void> {
  if (matches.length >= maxResults) return;

  const entries = await readdir(absolutePath, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (matches.length >= maxResults) return;
    if ([".git", ".cf-dw", "node_modules", "dist"].includes(entry.name)) continue;

    const child = path.join(absolutePath, entry.name);
    if (entry.isDirectory()) {
      await grepWalk(child, cwd, regex, matches, maxResults);
      continue;
    }

    const content = await readFile(child, "utf8").catch(() => "");
    if (!content) continue;

    const relative = path.relative(cwd, child).split(path.sep).join("/");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length && matches.length < maxResults; index += 1) {
      if (regex.test(lines[index])) {
        matches.push(`${relative}:${index + 1}: ${lines[index].slice(0, 300)}`);
      }
    }
  }
}

function okResult(call: ToolCall, args: Record<string, unknown>, content: string): StableToolResult {
  return {
    tool: call.tool,
    call_id: call.id,
    args,
    status: "ok",
    content_sha256: sha256(content),
    content
  };
}

function errorResult(call: ToolCall, error: string): StableToolResult {
  return {
    tool: isToolName(call.tool) ? call.tool : "list_directory",
    call_id: call.id,
    args: call.args,
    status: "error",
    error
  };
}

export function serializeToolResult(result: StableToolResult): string {
  return stableStringify(result);
}

function stringArg(args: Record<string, unknown>, key: string, fallback?: string): string {
  const value = args[key];
  if (typeof value === "string" && value.length > 0) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing string arg: ${key}`);
}

function numberArg(
  args: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  const value = args[key];
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function isToolName(value: string): value is ToolName {
  return value === "read_file" || value === "list_directory" || value === "grep";
}
