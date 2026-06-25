import * as fs from "fs";
import * as path from "path";

import { CONFIG } from "config";

/** Derive agentKey from a resolved skill directory path (basename). */
export function agentKeyFromSkillPath(skillPath: string): string {
  return path.basename(skillPath);
}

export function resolveUserMemoryPath(
  userId: string,
  agentKey: string
): string {
  return path.join(
    CONFIG.projectRoot,
    CONFIG.memoryRoot,
    userId,
    agentKey,
    "MEMORY.md"
  );
}

export function ensureAgentMemoryDir(
  userId: string,
  agentKey: string
): string {
  const dir = path.dirname(resolveUserMemoryPath(userId, agentKey));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
