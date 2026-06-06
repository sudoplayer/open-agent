import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { CONFIG } from "../config";


export interface SubagentDef {
  name: string;
  description: string;
  systemPrompt: string;
  skills: string[];
  tools: string[];
}

export interface OrchestratorDef {
  systemPrompt: string;
  skills: string[];
  tools: string[];
}

export interface ScenarioManifest {
  id: string;
  displayName: string;
  modelId: string;
  orchestrator: OrchestratorDef;
  subagents: SubagentDef[];
}

function skillRootFor(scenarioId: string): string {
  return path.join(CONFIG.scenariosRoot, scenarioId, "skills");
}

// 将短技能名展开为绝对路径（约定：scenarios/<id>/skills/<name>）
function resolveSkillPaths(
  names: string[],
  scenarioId: string
): string[] {
  const root = skillRootFor(scenarioId);
  return names.map((name) => path.join(root, name));
}

export function loadManifest(scenarioId: string): ScenarioManifest {
  const manifestPath = path.join(CONFIG.scenariosRoot, scenarioId, "manifest.yaml");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const raw = yaml.load(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;

  // orchestrator
  const orch = (raw["orchestrator"] as Record<string, unknown>) ?? {};
  const orchestrator: OrchestratorDef = {
    systemPrompt: String(orch["system_prompt"] ?? ""),
    skills: resolveSkillPaths(
      (orch["skills"] as string[]) ?? [],
      scenarioId
    ),
    tools: (orch["tools"] as string[]) ?? [],
  };

  // subagents
  const subagents: SubagentDef[] = ((raw["subagents"] as Record<string, unknown>[]) ?? []).map(
    (subagent) => {
      return {
        name: String(subagent["name"]),
        description: String(subagent["description"] ?? ""),
        systemPrompt: String(subagent["system_prompt"] ?? ""),
        skills: resolveSkillPaths(
          (subagent["skills"] as string[]) ?? [],
          scenarioId
        ),
        tools: (subagent["tools"] as string[]) ?? [],
      };
    }
  );

  return {
    id: String(raw["id"] ?? "id"),
    displayName: String(raw["display_name"] ?? "display_name"),
    modelId: String(raw["model_id"] ?? "model_id"),
    orchestrator,
    subagents,
  };
}
