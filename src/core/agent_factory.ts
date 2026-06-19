import { createDeepAgent, LocalShellBackend } from "deepagents";
import type { SubAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import type { StructuredTool } from "@langchain/core/tools";
import { CONFIG } from "../config";
import { WORKFLOW_CHECKPOINTER } from "../infra/workflow_checkpointer";
import { AgentManifest } from "./manifest_loader";
import * as path from "path";
import { makeAskUserQuestionTool } from "./tools/ask_user_question";
import { makeRequestFilePathTool } from "./tools/request_file_path";
import { makeStreamImageTool } from "./tools/stream_image";


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


type ToolFactory = (sessionId: string, sessionRunPath: string, ...args: unknown[]) => StructuredTool;

const PLATFORM_TOOL_FACTORIES: Record<string, ToolFactory> = {
  ask_user_question: makeAskUserQuestionTool as ToolFactory,
  request_file_path: makeRequestFilePathTool as ToolFactory,
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
  sessionRunPath: string
): StructuredTool {
  const factory = resolveToolFactory(ref);
  return factory(sessionId, sessionRunPath);
}


export function buildOrchestratorFromManifest(
  manifest: AgentManifest,
  sessionId: string,
  sessionRunPath: string
) {
  const llm = buildLlm();
  const backend = new LocalShellBackend({
    rootDir: CONFIG.projectRoot,
    virtualMode: false,
    inheritEnv: true,
  });

  const orchTools = manifest.orchestrator.tools.map((t) =>
    instantiateTool(t, sessionId, sessionRunPath)
  );

  const subagentDicts: SubAgent[] = manifest.subagents.map((subagent) => ({
    name: subagent.name,
    description: subagent.description,
    systemPrompt: `${subagent.systemPrompt}\n\nsessionRunPath: ${sessionRunPath}`,
    tools: subagent.tools.map((t) => instantiateTool(t, sessionId, sessionRunPath)),
    skills: subagent.skills,
  }));

  const orchestrator = createDeepAgent({
    model: llm,
    backend,
    skills: manifest.orchestrator.skills,
    subagents: subagentDicts,
    tools: orchTools,
    systemPrompt: manifest.orchestrator.systemPrompt,
    checkpointer: WORKFLOW_CHECKPOINTER,
  });

  return orchestrator;
}
