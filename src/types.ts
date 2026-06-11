export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  tool_call_id?: string;
}

export interface AgentCliOptions {
  cwd: string;
  prompt?: string;
  promptFile?: string;
  prefixFile?: string;
  cacheGroupId: string;
  sessionId: string;
  schemaFile?: string;
  outDir?: string;
  model: string;
  proModel: string;
  maxTurns: number;
  temperature: number;
  baseUrl: string;
  dryRun: boolean;
  allowShell: boolean;
  allowWrite: boolean;
}

export interface AgentSession {
  sessionId: string;
  cacheGroupId: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  immutablePrefix: string;
  appendOnlyLog: SessionLogEntry[];
  finalResult?: string;
}

export type SessionLogEntry =
  | {
      kind: "user_task";
      content: string;
    }
  | {
      kind: "assistant";
      turn: number;
      content: string;
    }
  | {
      kind: "tool_result";
      turn: number;
      result: StableToolResult;
    }
  | {
      kind: "repair_feedback";
      turn: number;
      content: string;
    };

export interface DeepSeekUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

export interface DeepSeekChatResponse {
  id?: string;
  model?: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
    };
    finish_reason?: string;
  }>;
  usage?: DeepSeekUsage;
}

export interface UsageLedgerEntry {
  sessionId: string;
  cacheGroupId: string;
  turn: number;
  model: string;
  usage: DeepSeekUsage;
  latencyMs: number;
  createdAt: string;
}

export type ToolName =
  | "read_file"
  | "list_directory"
  | "grep"
  | "write_file"
  | "run_shell"
  | "github_search_repos"
  | "github_get_readme"
  | "web_search"
  | "fetch_url";

export interface ToolCall {
  id: string;
  tool: ToolName;
  args: Record<string, unknown>;
}

export interface StableToolResult {
  tool: ToolName;
  call_id: string;
  args: Record<string, unknown>;
  status: "ok" | "error";
  content_sha256?: string;
  content?: string;
  error?: string;
}

export type AgentModelResponse =
  | {
      type: "tool_calls";
      calls: ToolCall[];
    }
  | {
      type: "final";
      content: string;
    };

export interface AgentRunResult {
  content: string;
  sessionPath: string;
  usagePath: string;
  hitRate: number | null;
}
