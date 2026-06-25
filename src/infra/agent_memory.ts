import * as fs from "fs";
import * as path from "path";

import { CONFIG } from "config";

/** Derive agentId from a resolved skill directory path (basename). */
export function agentIdFromSkillPath(skillPath: string): string {
  return path.basename(skillPath);
}

export function resolveUserMemoryPath(
  userId: string,
  agentId: string
): string {
  return path.join(
    CONFIG.projectRoot,
    CONFIG.memoryRoot,
    userId,
    agentId,
    "MEMORY.md"
  );
}

export function ensureAgentMemoryDir(
  userId: string,
  agentId: string
): string {
  const dir = path.dirname(resolveUserMemoryPath(userId, agentId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
