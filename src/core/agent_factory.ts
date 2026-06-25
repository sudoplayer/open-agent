import { createDeepAgent, LocalShellBackend } from "deepagents";
import type { SubAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import type { StructuredTool } from "@langchain/core/tools";
import { CONFIG } from "../config";
import {
  agentKeyFromSkillPath,
  resolveUserMemoryPath,
} from "../infra/agent_memory";
import { getWorkflowCheckpointer } from "../infra/workflow_checkpointer";
import { AgentManifest } from "./manifest_loader";
import * as path from "path";
import { makeAskUserQuestionTool } from "./tools/ask_user_question";
import { makeRequestFilePathTool } from "./tools/request_file_path";
import { MEMORY_PROTOCOL_PROMPT, makeSaveMemoryTool } from "./tools/save_memory";
import { makeStreamImageTool } from "./tools/stream_image";

function hasSaveMemory(tools: string[]): boolean {
  return tools.includes("platform.save_memory");
}

export function buildSystemPrompt(
  basePrompt: string,
  sessionRunPath: string,
  userId: string,
  agentKey: string,
  tools: string[]
): string {
  const parts = [basePrompt, ""];
  const contextLines = [
    `userId: ${userId}`,
    `sessionRunPath: ${sessionRunPath}`,
  ];
  if (hasSaveMemory(tools)) {
    contextLines.push(
      `userMemoryPath: ${resolveUserMemoryPath(userId, agentKey)}`
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

type ToolFactory = (
  sessionId: string,
  sessionRunPath: string,
  userId: string,
  agentKey?: string
) => StructuredTool;

const PLATFORM_TOOL_FACTORIES: Record<string, ToolFactory> = {
  ask_user_question: makeAskUserQuestionTool as ToolFactory,
  request_file_path: makeRequestFilePathTool as ToolFactory,
  save_memory: makeSaveMemoryTool as ToolFactory,
  stream_image: makeStreamImageTool as ToolFactory,
};

function resolveToolFactory(toolRef: string): ToolFactory {
  // Platform tools: "platform.<toolName>"
  if (toolRef.startsWith("platform.")) {
    const toolName = toolRef.slice("platform.".length);
    const factory = PLATFORM_TOOL_FACTORIES[toolName];
    if (!factory) {
      const available = Object.keys(PLATFORM_TOOL_FACTORIES).join(", ") || "(none)";
      throw new Error(`Unknown platform tool: "${toolName}". Available: ${available}`);
    }
    return factory;
  }

  // Agent tools: bare name, loaded from agents/tools/index.ts
  const modPath = path.join(CONFIG.agentsRoot, "tools", "index");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(modPath);
  const factories: Record<string, ToolFactory> = mod.toolFactories ?? {};
  const factory = factories[toolRef];
  if (!factory) {
    const available = Object.keys(factories).join(", ") || "(none)";
    throw new Error(
      `Unknown agent tool: "${toolRef}". ` +
      `Available: ${available}`
    );
  }
  return factory;
}

function instantiateTool(
  ref: string,
  sessionId: string,
  sessionRunPath: string,
  userId: string,
  agentKey?: string
): StructuredTool {
  if (ref.startsWith("platform.")) {
    const factory = resolveToolFactory(ref);
    if (ref === "platform.save_memory") {
      if (!agentKey) {
        throw new Error("save_memory requires agentKey");
      }
      return factory(sessionId, sessionRunPath, userId, agentKey);
    }
    return (factory as (s: string, r: string) => StructuredTool)(
      sessionId,
      sessionRunPath
    );
  }

  const factory = resolveToolFactory(ref);
  return (factory as (s: string, r: string) => StructuredTool)(
    sessionId,
    sessionRunPath
  );
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

  const orchestratorAgentKey = agentKeyFromSkillPath(
    manifest.orchestrator.skills[0]
  );

  const orchTools = manifest.orchestrator.tools.map((t) =>
    instantiateTool(
      t,
      sessionId,
      sessionRunPath,
      userId,
      orchestratorAgentKey
    )
  );

  const subagentDicts: SubAgent[] = manifest.subagents.map((subagent) => {
    const agentKey = agentKeyFromSkillPath(subagent.skills[0]);
    return {
      name: subagent.name,
      description: subagent.description,
      systemPrompt: buildSystemPrompt(
        subagent.systemPrompt,
        sessionRunPath,
        userId,
        agentKey,
        subagent.tools
      ),
      tools: subagent.tools.map((t) =>
        instantiateTool(t, sessionId, sessionRunPath, userId, agentKey)
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
      orchestratorAgentKey,
      manifest.orchestrator.tools
    ),
    checkpointer: getWorkflowCheckpointer(),
  });

  return orchestrator;
}
