import path from "node:path";
import { appendFile } from "node:fs/promises";
import { ensureDir, fileExists, readTextFile } from "./fs-utils.js";
import { stableStringify } from "./stable-json.js";
import type { UsageLedgerEntry } from "./types.js";

export class UsageLedger {
  readonly path: string;

  constructor(outDir: string) {
    this.path = path.join(outDir, "usage.jsonl");
  }

  async append(entry: UsageLedgerEntry): Promise<void> {
    await ensureDir(path.dirname(this.path));
    await appendFile(this.path, `${stableStringify(entry, 0)}\n`, "utf8");
  }

  async hitRate(): Promise<number | null> {
    if (!(await fileExists(this.path))) return null;
    const text = await readTextFile(this.path);
    let hit = 0;
    let miss = 0;

    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line) as UsageLedgerEntry;
      hit += entry.usage.prompt_cache_hit_tokens ?? 0;
      miss += entry.usage.prompt_cache_miss_tokens ?? 0;
    }

    const total = hit + miss;
    return total > 0 ? hit / total : null;
  }
}
