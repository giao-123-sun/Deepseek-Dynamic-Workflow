import path from "node:path";
import { DeepSeekClient } from "./deepseek-client.js";
import { loadDotEnv } from "./env.js";
import { verifyClaimedArtifacts } from "./artifact-claims.js";
import { readTextFile, sha256 } from "./fs-utils.js";
import { buildMessages } from "./message-serializer.js";
import { parseModelResponse } from "./model-response.js";
import { buildImmutablePrefix } from "./prefix-builder.js";
import { loadSelfEvolveContext } from "./self-evolve-context.js";
import { SessionStore } from "./session-store.js";
import { dispatchTools } from "./tool-router.js";
import type { AgentCliOptions, AgentRunResult } from "./types.js";
import { UsageLedger } from "./usage-ledger.js";

export async function runAgentSession(options: AgentCliOptions): Promise<AgentRunResult> {
  await loadDotEnv([
    path.join(process.cwd(), ".env"),
    path.join(options.cwd, ".env")
  ]);

  const task = options.prompt ?? (await readTextFile(options.promptFile!));
  const effectiveSessionId = options.sessionId === "auto"
    ? `agent_${sha256(`${Date.now()}_${process.pid}_${task}`).slice(0, 18)}`
    : options.sessionId;
  const baseImmutablePrefix = await buildImmutablePrefix({
    cwd: options.cwd,
    cacheGroupId: options.cacheGroupId,
    prefixFile: options.prefixFile,
    schemaFile: options.schemaFile
  });
  const selfEvolveContext = await loadSelfEvolveContext(options.cwd);
  const immutablePrefix = selfEvolveContext
    ? `${baseImmutablePrefix}\n\n${selfEvolveContext}`
    : baseImmutablePrefix;

  const outDir = options.outDir ?? path.join(options.cwd, ".cf-dw", "runs", effectiveSessionId);
  const store = new SessionStore(outDir);
  const ledger = new UsageLedger(outDir);
  const session = await store.createOrResume({
    sessionId: effectiveSessionId,
    cacheGroupId: options.cacheGroupId,
    cwd: options.cwd,
    immutablePrefix,
    task
  });

  if (options.dryRun) {
    const result = `Dry run complete for session ${effectiveSessionId}.`;
    await store.finalize(session, result);
    return {
      content: result,
      sessionPath: store.sessionPath,
      usagePath: ledger.path,
      hitRate: null
    };
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is required unless --dry-run is used.");
  }

  const client = new DeepSeekClient({ apiKey, baseUrl: options.baseUrl });

  for (let turn = 1; turn <= options.maxTurns; turn += 1) {
    const messages = buildMessages(session, {
      allowShell: options.allowShell,
      allowWrite: options.allowWrite
    });
    const started = Date.now();
    const response = await client.chat({
      model: options.model,
      messages,
      userId: options.cacheGroupId,
      temperature: options.temperature
    });
    const latencyMs = Date.now() - started;
    const content = response.choices[0]?.message.content ?? "";

    await ledger.append({
      sessionId: effectiveSessionId,
      cacheGroupId: options.cacheGroupId,
      turn,
      model: response.model ?? options.model,
      usage: response.usage ?? {},
      latencyMs,
      createdAt: new Date().toISOString()
    });

    await store.append(session, {
      kind: "assistant",
      turn,
      content
    });

    let parsed;
    try {
      parsed = parseModelResponse(content);
    } catch (error) {
      await store.append(session, {
        kind: "repair_feedback",
        turn,
        content: `The previous assistant response was not valid protocol JSON. Error: ${
          error instanceof Error ? error.message : String(error)
        }. Reply again with JSON only.`
      });
      continue;
    }

    if (parsed.type === "final") {
      const artifactClaims = await verifyClaimedArtifacts(options.cwd, parsed.content);
      if (artifactClaims.missing.length > 0) {
        await store.append(session, {
          kind: "repair_feedback",
          turn,
          content: [
            "The final answer claims artifact files exist, but these paths are missing:",
            artifactClaims.missing.map((artifact) => `- ${artifact}`).join("\n"),
            "Call write_file with valid JSON, then verify the file with read_file or list_directory before sending final."
          ].join("\n")
        });
        continue;
      }

      await store.finalize(session, parsed.content);
      return {
        content: parsed.content,
        sessionPath: store.sessionPath,
        usagePath: ledger.path,
        hitRate: await ledger.hitRate()
      };
    }

    const results = await dispatchTools(options.cwd, parsed.calls, {
      allowShell: options.allowShell,
      allowWrite: options.allowWrite
    });
    for (const result of results) {
      await store.append(session, {
        kind: "tool_result",
        turn,
        result
      });
    }
  }

  throw new Error(`AgentSession exceeded maxTurns=${options.maxTurns}`);
}
