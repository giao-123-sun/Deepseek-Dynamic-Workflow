import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { readTextFile, sha256 } from "./fs-utils.js";

const MAX_SUMMARY_FILES = 80;

export async function buildImmutablePrefix(options: {
  cwd: string;
  cacheGroupId: string;
  prefixFile?: string;
  schemaFile?: string;
}): Promise<string> {
  const repoContext = options.prefixFile
    ? await readTextFile(options.prefixFile)
    : await buildWorkspaceSummary(options.cwd);

  const schemaContract = options.schemaFile
    ? await readTextFile(options.schemaFile)
    : "No external schema file was provided. Return concise plain text unless the task asks for structured output.";

  const toolProtocol = [
    "Available tools are read-only and must be requested with stable JSON.",
    "",
    "When you need tools, reply with JSON only:",
    "{\"type\":\"tool_calls\",\"calls\":[{\"id\":\"call_1\",\"tool\":\"list_directory\",\"args\":{\"path\":\".\"}}]}",
    "",
    "Allowed tools:",
    "- list_directory args: {\"path\":\"relative/path\"}",
    "- read_file args: {\"path\":\"relative/path\",\"maxBytes\":20000}",
    "- grep args: {\"pattern\":\"text or regex\",\"path\":\"relative/path\",\"maxResults\":20}",
    "",
    "When you are done, reply with JSON only:",
    "{\"type\":\"final\",\"content\":\"...final answer...\"}"
  ].join("\n");

  const repoHash = sha256(repoContext);
  const schemaHash = sha256(schemaContract);
  const toolHash = sha256(toolProtocol);

  return [
    "C-FDW CACHE PREFIX v1",
    `cache_group_id: ${options.cacheGroupId}`,
    `repo_context_hash: sha256:${repoHash}`,
    `schema_contract_hash: sha256:${schemaHash}`,
    `tool_protocol_hash: sha256:${toolHash}`,
    "",
    "<runtime_contract>",
    "You are an isolated coding agent inside a dynamic workflow.",
    "Do not assume access to sibling agents.",
    "Use tools when needed.",
    "Keep all tool requests and final outputs in the specified JSON protocol.",
    "Do not include current timestamps, hostnames, absolute local paths, random seeds, or retry counters in stable outputs.",
    "</runtime_contract>",
    "",
    "<output_contract>",
    schemaContract,
    "</output_contract>",
    "",
    "<repo_context>",
    repoContext,
    "</repo_context>",
    "",
    "<tool_protocol>",
    toolProtocol,
    "</tool_protocol>"
  ].join("\n");
}

async function buildWorkspaceSummary(cwd: string): Promise<string> {
  const files = await walk(cwd, ".", []);
  const lines = [
    "Repomix prefix file was not provided.",
    "Using deterministic workspace summary fallback.",
    "",
    "<workspace_files>"
  ];

  for (const file of files.slice(0, MAX_SUMMARY_FILES)) {
    lines.push(file);
  }

  if (files.length > MAX_SUMMARY_FILES) {
    lines.push(`... ${files.length - MAX_SUMMARY_FILES} more files omitted`);
  }

  lines.push("</workspace_files>");
  return lines.join("\n");
}

async function walk(root: string, relativeDir: string, acc: string[]): Promise<string[]> {
  const absoluteDir = path.resolve(root, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (shouldSkip(entry.name)) continue;
    const relativePath = path.posix.join(relativeDir.split(path.sep).join("/"), entry.name);
    const normalized = relativePath === "." ? entry.name : relativePath.replace(/^\.\//, "");
    const absolutePath = path.resolve(root, normalized);

    if (entry.isDirectory()) {
      await walk(root, normalized, acc);
      continue;
    }

    const info = await stat(absolutePath);
    acc.push(`${normalized} (${info.size} bytes)`);
  }

  return acc;
}

function shouldSkip(name: string): boolean {
  return [
    ".git",
    ".cf-dw",
    "node_modules",
    "dist",
    ".env",
    ".DS_Store"
  ].includes(name);
}
