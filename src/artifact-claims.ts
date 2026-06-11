import path from "node:path";
import { fileExists } from "./fs-utils.js";

export interface ArtifactClaimCheck {
  existing: string[];
  missing: string[];
}

export async function verifyClaimedArtifacts(cwd: string, text: string): Promise<ArtifactClaimCheck> {
  const candidates = unique(extractClaimedArtifactPaths(text));
  const existing: string[] = [];
  const missing: string[] = [];
  const cwdAbs = path.resolve(cwd);

  for (const candidate of candidates) {
    const resolved = path.resolve(cwdAbs, candidate);
    if (!isInside(resolved, cwdAbs)) continue;
    if (await fileExists(resolved)) existing.push(candidate);
    else missing.push(candidate);
  }

  return {
    existing: unique(existing),
    missing: unique(missing)
  };
}

export function extractClaimedArtifactPaths(text: string): string[] {
  const matches: string[] = [];
  const pattern = /(?:`|")?((?:\.cf-dw|awesome-dynamic-workflows\/research)[A-Za-z0-9._/\\-]+\.(?:md|json|html|txt|csv))(?:`|")?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const cleaned = normalizeArtifactPath(match[1] ?? "");
    if (cleaned) matches.push(cleaned);
  }
  return matches;
}

function normalizeArtifactPath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/[),.;:]+$/g, "")
    .replace(/^\/+/, "")
    .trim();
}

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
