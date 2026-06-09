import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadDotEnv(paths: string[]): Promise<void> {
  const seen = new Set<string>();

  for (const candidate of paths) {
    const filePath = path.resolve(candidate);
    if (seen.has(filePath)) continue;
    seen.add(filePath);

    const content = await readFile(filePath, "utf8").catch(() => undefined);
    if (content === undefined) continue;

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const index = line.indexOf("=");
      if (index <= 0) continue;

      const key = line.slice(0, index).trim();
      const value = unquote(line.slice(index + 1).trim());

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
