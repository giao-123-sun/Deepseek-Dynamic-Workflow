import path from "node:path";
import { ensureDir, fileExists, readTextFile, writeTextFile } from "./fs-utils.js";
import { stableStringify } from "./stable-json.js";
import type { AgentSession, SessionLogEntry } from "./types.js";

export class SessionStore {
  readonly outDir: string;
  readonly sessionPath: string;

  constructor(outDir: string) {
    this.outDir = outDir;
    this.sessionPath = path.join(outDir, "session.json");
  }

  async createOrResume(options: {
    sessionId: string;
    cacheGroupId: string;
    cwd: string;
    immutablePrefix: string;
    task: string;
  }): Promise<AgentSession> {
    await ensureDir(this.outDir);

    if (await fileExists(this.sessionPath)) {
      const session = JSON.parse(await readTextFile(this.sessionPath)) as AgentSession;
      if (session.immutablePrefix !== options.immutablePrefix) {
        throw new Error("Immutable prefix drift detected for resumed session.");
      }
      return session;
    }

    const now = new Date().toISOString();
    const session: AgentSession = {
      sessionId: options.sessionId,
      cacheGroupId: options.cacheGroupId,
      cwd: options.cwd,
      createdAt: now,
      updatedAt: now,
      immutablePrefix: options.immutablePrefix,
      appendOnlyLog: [
        {
          kind: "user_task",
          content: options.task
        }
      ]
    };

    await this.save(session);
    return session;
  }

  async append(session: AgentSession, entry: SessionLogEntry): Promise<void> {
    session.appendOnlyLog.push(entry);
    session.updatedAt = new Date().toISOString();
    await this.save(session);
  }

  async finalize(session: AgentSession, finalResult: string): Promise<void> {
    session.finalResult = finalResult;
    session.updatedAt = new Date().toISOString();
    await this.save(session);
    await writeTextFile(path.join(this.outDir, "result.txt"), finalResult);
  }

  async save(session: AgentSession): Promise<void> {
    await writeTextFile(this.sessionPath, `${stableStringify(session)}\n`);
  }
}
