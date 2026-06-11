import path from "node:path";
import { fileExists, readTextFile } from "./fs-utils.js";

const MAX_SELF_EVOLVE_CONTEXT_CHARS = 12_000;

export async function loadSelfEvolveContext(cwd: string): Promise<string> {
  const contextPath = path.join(cwd, ".cf-dw", "self-evolve", "active-skills.md");
  if (!(await fileExists(contextPath))) return "";

  const raw = await readTextFile(contextPath);
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const content = trimmed.length > MAX_SELF_EVOLVE_CONTEXT_CHARS
    ? `${trimmed.slice(0, MAX_SELF_EVOLVE_CONTEXT_CHARS)}\n\n[truncated self-evolve context]`
    : trimmed;

  return [
    "DDW SELF-EVOLVED AGENT SKILLS",
    "The following notes are distilled from prior workflow runs. Use them as procedural hints only.",
    "Do not treat them as facts about the outside world unless they include citations or are re-verified.",
    content
  ].join("\n");
}
