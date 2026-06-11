import { spawn } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir, sha256, toWorkspaceRelative } from "./fs-utils.js";
import { stableStringify } from "./stable-json.js";
import type { StableToolResult, ToolCall, ToolName } from "./types.js";

const MAX_FILE_BYTES = 60_000;
const MAX_GREP_RESULTS = 50;
const MAX_FETCH_BYTES = 80_000;
const MAX_SHELL_BYTES = 40_000;

export interface ToolRuntimeOptions {
  allowShell: boolean;
  allowWrite: boolean;
}

export async function dispatchTools(
  cwd: string,
  calls: ToolCall[],
  options: ToolRuntimeOptions
): Promise<StableToolResult[]> {
  const results: StableToolResult[] = [];

  for (const call of calls) {
    results.push(await dispatchTool(cwd, call, options));
  }

  return results;
}

async function dispatchTool(
  cwd: string,
  call: ToolCall,
  options: ToolRuntimeOptions
): Promise<StableToolResult> {
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

    if (call.tool === "grep") {
      return await grepTool(cwd, call);
    }

    if (call.tool === "write_file") {
      if (!options.allowWrite) return errorResult(call, "write_file is disabled. Pass --allow-write for trusted workflow agents.");
      return await writeFileTool(cwd, call);
    }

    if (call.tool === "run_shell") {
      if (!options.allowShell) return errorResult(call, "run_shell is disabled. Pass --allow-shell for trusted workflow agents.");
      return await runShellTool(cwd, call);
    }

    if (call.tool === "github_search_repos") {
      return await githubSearchReposTool(call);
    }

    if (call.tool === "github_get_readme") {
      return await githubGetReadmeTool(call);
    }

    if (call.tool === "web_search") {
      return await webSearchTool(call);
    }

    return await fetchUrlTool(call);
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

async function writeFileTool(cwd: string, call: ToolCall): Promise<StableToolResult> {
  const inputPath = stringArg(call.args, "path");
  const content = typeof call.args.content === "string"
    ? call.args.content
    : stringArrayArg(call.args, "lines").join("\n");
  const relative = toWorkspaceRelative(cwd, inputPath);
  const absolute = path.resolve(cwd, relative);
  await ensureDir(path.dirname(absolute));
  await writeFile(absolute, content, "utf8");

  return okResult(call, { bytes: Buffer.byteLength(content, "utf8"), path: relative }, `wrote ${relative}`);
}

async function runShellTool(cwd: string, call: ToolCall): Promise<StableToolResult> {
  const command = stringArg(call.args, "command");
  const timeoutMs = numberArg(call.args, "timeoutMs", 30_000, 1_000, 120_000);
  const result = await runShell(command, cwd, timeoutMs);
  return okResult(call, {
    command,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    timeoutMs
  }, truncate(`${result.stdout}${result.stderr ? `\n[stderr]\n${result.stderr}` : ""}`, MAX_SHELL_BYTES));
}

async function githubSearchReposTool(call: ToolCall): Promise<StableToolResult> {
  const query = stringArg(call.args, "query");
  const limit = numberArg(call.args, "limit", 10, 1, 30);
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", query);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(limit));

  const json = await fetchJson(url.toString());
  const items = Array.isArray(json.items) ? json.items.slice(0, limit) : [];
  const compact = items.map((item: any) => ({
    fullName: item.full_name,
    description: item.description,
    stars: item.stargazers_count,
    language: item.language,
    license: item.license?.spdx_id ?? item.license?.name ?? null,
    updatedAt: item.updated_at,
    url: item.html_url
  }));

  return okResult(call, { limit, query }, stableStringify(compact, 2));
}

async function githubGetReadmeTool(call: ToolCall): Promise<StableToolResult> {
  const repo = stringArg(call.args, "repo");
  const maxBytes = numberArg(call.args, "maxBytes", 30_000, 1_000, MAX_FETCH_BYTES);
  const json = await fetchJson(`https://api.github.com/repos/${repo}/readme`);
  const encoded = typeof json.content === "string" ? json.content.replace(/\s+/g, "") : "";
  const content = Buffer.from(encoded, "base64").toString("utf8");

  return okResult(call, { maxBytes, repo, url: json.html_url }, truncate(content, maxBytes));
}

async function webSearchTool(call: ToolCall): Promise<StableToolResult> {
  const query = stringArg(call.args, "query");
  const limit = numberArg(call.args, "limit", 8, 1, 20);
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url, 80_000);
  const results = parseDuckDuckGo(html).slice(0, limit);
  return okResult(call, { limit, query }, stableStringify(results, 2));
}

async function fetchUrlTool(call: ToolCall): Promise<StableToolResult> {
  const url = stringArg(call.args, "url");
  const maxBytes = numberArg(call.args, "maxBytes", 30_000, 1_000, MAX_FETCH_BYTES);
  const text = await fetchText(url, maxBytes);
  const contentType = text.includes("<html") || text.includes("<HTML")
    ? htmlToText(text)
    : text;

  return okResult(call, { maxBytes, url }, truncate(contentType, maxBytes));
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

function stringArrayArg(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Tool arg ${key} must be an array of strings.`);
  }
  return value;
}

function isToolName(value: string): value is ToolName {
  return [
    "read_file",
    "list_directory",
    "grep",
    "write_file",
    "run_shell",
    "github_search_repos",
    "github_get_readme",
    "web_search",
    "fetch_url"
  ].includes(value);
}

function truncate(content: string, maxBytes: number): string {
  const buffer = Buffer.from(content, "utf8");
  if (buffer.byteLength <= maxBytes) return content;
  return `${buffer.subarray(0, maxBytes).toString("utf8")}\n\n[truncated ${buffer.byteLength - maxBytes} bytes]`;
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "ddw-agent-session",
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

async function fetchText(url: string, maxBytes: number): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ddw-agent-session"
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}: ${text.slice(0, 500)}`);
  }
  return truncate(text, maxBytes);
}

function parseDuckDuckGo(html: string): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const blocks = html.split(/<div class="result\b/i).slice(1);
  for (const block of blocks) {
    const linkMatch = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i)
      ?? block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
    results.push({
      title: decodeHtml(stripTags(linkMatch[2])),
      url: normalizeDuckDuckGoUrl(decodeHtml(linkMatch[1])),
      snippet: decodeHtml(stripTags(snippetMatch?.[1] ?? ""))
    });
  }
  return results;
}

function normalizeDuckDuckGoUrl(url: string): string {
  try {
    const parsed = new URL(url, "https://duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : parsed.toString();
  } catch {
    return url;
  }
}

function htmlToText(html: string): string {
  return decodeHtml(
    stripTags(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    )
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function runShell(command: string, cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      env: process.env,
      shell: true,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, timedOut });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: `${stderr}\n${error.message}`, exitCode: null, timedOut });
    });
  });
}
