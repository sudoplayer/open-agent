import { createDeepAgent, LocalShellBackend } from "deepagents";
import type { SubAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import type { StructuredTool } from "@langchain/core/tools";
import { CONFIG } from "../config";
import {
  agentIdFromSkillPath,
  resolveUserMemoryPath,
} from "../infra/agent_memory";
import { getWorkflowCheckpointer } from "../infra/workflow_checkpointer";
import { AgentManifest } from "./manifest_loader";
import { makeAskUserQuestionTool } from "./tools/ask_user_question";
import { MEMORY_PROTOCOL_PROMPT, makeSaveMemoryTool } from "./tools/save_memory";
import { makeStreamImageTool } from "./tools/stream_image";

function hasSaveMemory(tools: string[]): boolean {
  return tools.includes("platform.save_memory");
}

export function buildSystemPrompt(
  basePrompt: string,
  sessionRunPath: string,
  userId: string,
  agentId: string,
  tools: string[]
): string {
  const parts = [basePrompt, ""];
  const contextLines = [
    `userId: ${userId}`,
    `sessionRunPath: ${sessionRunPath}`,
  ];
  if (hasSaveMemory(tools)) {
    contextLines.push(
      `userMemoryPath: ${resolveUserMemoryPath(userId, agentId)}`
    );
  }
  parts.push(contextLines.join("\n"));
  if (hasSaveMemory(tools)) {
    parts.push("", MEMORY_PROTOCOL_PROMPT);
  }
  return parts.join("\n");
}

function buildLlm(): ChatOpenAI {
  const modelKwargs: Record<string, unknown> =
    !CONFIG.thinkingEnabled ? { thinking: { type: "disabled" } } : {};

  return new ChatOpenAI({
    model: CONFIG.modelName,
    apiKey: CONFIG.llmApiKey,
    configuration: { baseURL: CONFIG.modelBaseUrl },
    temperature: CONFIG.temperature,
    modelKwargs: Object.keys(modelKwargs).length > 0 ? modelKwargs : undefined,
  });
}

const PLATFORM_TOOL_FACTORIES: Record<string, (...args: any[]) => StructuredTool> = {
  ask_user_question: makeAskUserQuestionTool,
  save_memory: makeSaveMemoryTool,
  stream_image: makeStreamImageTool,
};

function instantiateTool(
  ref: string,
  sessionId: string,
  sessionRunPath: string,
  userId: string,
  agentId?: string
): StructuredTool {
  if (!ref.startsWith("platform.")) {
    throw new Error(`Unknown tool: "${ref}". Only platform tools are supported.`);
  }

  const toolName = ref.slice("platform.".length);
  const factory = PLATFORM_TOOL_FACTORIES[toolName];
  if (!factory) {
    const available = Object.keys(PLATFORM_TOOL_FACTORIES).join(", ") || "(none)";
    throw new Error(`Unknown platform tool: "${toolName}". Available: ${available}`);
  }

  if (toolName === "save_memory") {
    if (!agentId) {
      throw new Error("save_memory requires agentId");
    }
    return makeSaveMemoryTool(sessionId, sessionRunPath, userId, agentId);
  }
  if (toolName === "stream_image") {
    return makeStreamImageTool(sessionId, sessionRunPath, userId);
  }
  return factory(sessionId, sessionRunPath);
}

export function buildOrchestratorFromManifest(
  manifest: AgentManifest,
  sessionId: string,
  sessionRunPath: string,
  userId: string
) {
  const llm = buildLlm();
  const backend = new LocalShellBackend({
    rootDir: CONFIG.projectRoot,
    virtualMode: false,
    inheritEnv: true,
  });

  const orchestratoragentId = agentIdFromSkillPath(
    manifest.orchestrator.skills[0]
  );

  const orchTools = manifest.orchestrator.tools.map((t) =>
    instantiateTool(
      t,
      sessionId,
      sessionRunPath,
      userId,
      orchestratoragentId
    )
  );

  const subagentDicts: SubAgent[] = manifest.subagents.map((subagent) => {
    const agentId = agentIdFromSkillPath(subagent.skills[0]);
    return {
      name: subagent.name,
      description: subagent.description,
      systemPrompt: buildSystemPrompt(
        subagent.systemPrompt,
        sessionRunPath,
        userId,
        agentId,
        subagent.tools
      ),
      tools: subagent.tools.map((t) =>
        instantiateTool(t, sessionId, sessionRunPath, userId, agentId)
      ),
      skills: subagent.skills,
    };
  });

  const orchestrator = createDeepAgent({
    model: llm,
    backend,
    skills: manifest.orchestrator.skills,
    subagents: subagentDicts,
    tools: orchTools,
    systemPrompt: buildSystemPrompt(
      manifest.orchestrator.systemPrompt,
      sessionRunPath,
      userId,
      orchestratoragentId,
      manifest.orchestrator.tools
    ),
    checkpointer: getWorkflowCheckpointer(),
  });

  return orchestrator;
}
