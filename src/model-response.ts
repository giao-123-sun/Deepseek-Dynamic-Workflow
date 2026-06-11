import type { AgentModelResponse, ToolCall, ToolName } from "./types.js";

export function parseModelResponse(content: string): AgentModelResponse {
  const jsonText = extractJson(content);
  const parsed = JSON.parse(jsonText) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Model response is not a JSON object.");
  }

  const record = parsed as Record<string, unknown>;
  if (record.type === "final") {
    if (typeof record.content !== "string") {
      throw new Error("Final response must include string content.");
    }
    return { type: "final", content: record.content };
  }

  if (record.type === "tool_calls") {
    if (!Array.isArray(record.calls)) {
      throw new Error("tool_calls response must include calls array.");
    }
    return {
      type: "tool_calls",
      calls: record.calls.map(normalizeToolCall)
    };
  }

  throw new Error("Response type must be final or tool_calls.");
}

function normalizeToolCall(value: unknown, index: number): ToolCall {
  if (!value || typeof value !== "object") {
    throw new Error(`Tool call ${index} is not an object.`);
  }

  const record = value as Record<string, unknown>;
  const tool = record.tool;
  if (!isToolName(tool)) {
    throw new Error(`Tool call ${index} has unsupported tool.`);
  }

  return {
    id: typeof record.id === "string" && record.id ? record.id : `call_${index + 1}`,
    tool,
    args: isRecord(record.args) ? record.args : {}
  };
}

function extractJson(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  throw new Error("Could not find JSON object in model response.");
}

function isToolName(value: unknown): value is ToolName {
  return typeof value === "string" && [
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
