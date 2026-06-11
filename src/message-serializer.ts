import { stableStringify } from "./stable-json.js";
import type { AgentSession, ChatMessage } from "./types.js";

export interface MessageBuildOptions {
  allowShell: boolean;
  allowWrite: boolean;
}

export function buildMessages(session: AgentSession, options: MessageBuildOptions): ChatMessage[] {
  const logText = session.appendOnlyLog
    .map((entry) => {
      if (entry.kind === "user_task") {
        return `<user_task>\n${entry.content}\n</user_task>`;
      }

      if (entry.kind === "assistant") {
        return `<assistant turn="${entry.turn}">\n${entry.content}\n</assistant>`;
      }

      if (entry.kind === "tool_result") {
        return `<tool_result turn="${entry.turn}">\n${stableStringify(entry.result)}\n</tool_result>`;
      }

      return `<repair_feedback turn="${entry.turn}">\n${entry.content}\n</repair_feedback>`;
    })
    .join("\n\n");

  return [
    {
      role: "system",
      content: "You are DDW AgentSession worker v0.1. Follow the cache-stable protocol exactly."
    },
    {
      role: "user",
      content: [
        session.immutablePrefix,
        "",
        toolContract(options),
        "",
        "<append_only_log>",
        logText,
        "</append_only_log>",
        "",
        "Reply with JSON only, using either type=tool_calls or type=final."
      ].join("\n")
    }
  ];
}

function toolContract(options: MessageBuildOptions): string {
  const tools = [
    "- read_file args: {\"path\":\"README.md\",\"maxBytes\":20000}",
    "- list_directory args: {\"path\":\".\"}",
    "- grep args: {\"pattern\":\"dynamic workflow\",\"path\":\".\",\"maxResults\":20}",
    "- github_search_repos args: {\"query\":\"multi-agent workflow\",\"limit\":10}",
    "- github_get_readme args: {\"repo\":\"owner/name\",\"maxBytes\":30000}",
    "- web_search args: {\"query\":\"dynamic workflows AI agents industry use cases\",\"limit\":8}",
    "- fetch_url args: {\"url\":\"https://example.com\",\"maxBytes\":30000}"
  ];

  if (options.allowWrite) {
    tools.push("- write_file args: {\"path\":\"awesome-dynamic-workflows/README.md\",\"content\":\"...\"}");
    tools.push("- write_file args for Markdown artifacts: {\"path\":\".cf-dw/evals/example.md\",\"lines\":[\"# Title\",\"\",\"- concise line\"]}");
  }
  if (options.allowShell) {
    tools.push("- run_shell args: {\"command\":\"gh search repos \\\"dynamic workflows\\\" --limit 10\",\"timeoutMs\":30000}");
  }

  return [
    "<tool_contract>",
    "You can either call tools or return a final answer. Use JSON only.",
    "Tool call format:",
    "{\"type\":\"tool_calls\",\"calls\":[{\"id\":\"call_1\",\"tool\":\"github_search_repos\",\"args\":{\"query\":\"dynamic workflows agents\",\"limit\":10}}]}",
    "Final format:",
    "{\"type\":\"final\",\"content\":\"your result\"}",
    "Available tools:",
    ...tools,
    "For research tasks, collect sources with tools first, cite URLs in the final answer, and write requested artifacts before finalizing when write_file is available.",
    "For long Markdown artifacts, prefer write_file with a lines array so JSON stays valid. After writing, verify the artifact with read_file or list_directory before final.",
    "</tool_contract>"
  ].join("\n");
}
