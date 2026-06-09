import { stableStringify } from "./stable-json.js";
import type { AgentSession, ChatMessage } from "./types.js";

export function buildMessages(session: AgentSession): ChatMessage[] {
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
      content: "You are C-FDW AgentSession worker v0.1. Follow the cache-stable protocol exactly."
    },
    {
      role: "user",
      content: [
        session.immutablePrefix,
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
