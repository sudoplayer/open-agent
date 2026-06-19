"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOrchestratorFromManifest = buildOrchestratorFromManifest;
const deepagents_1 = require("deepagents");
const openai_1 = require("@langchain/openai");
const config_1 = require("../config");
const workflow_checkpointer_1 = require("../infra/workflow_checkpointer");
const path = __importStar(require("path"));
const ask_user_question_1 = require("./tools/ask_user_question");
const request_file_path_1 = require("./tools/request_file_path");
const stream_image_1 = require("./tools/stream_image");
function buildLlm() {
    const modelKwargs = !config_1.CONFIG.thinkingEnabled ? { thinking: { type: "disabled" } } : {};
    return new openai_1.ChatOpenAI({
        model: config_1.CONFIG.modelName,
        apiKey: config_1.CONFIG.llmApiKey,
        configuration: { baseURL: config_1.CONFIG.modelBaseUrl },
        temperature: config_1.CONFIG.temperature,
        modelKwargs: Object.keys(modelKwargs).length > 0 ? modelKwargs : undefined,
    });
}
const PLATFORM_TOOL_FACTORIES = {
    ask_user_question: ask_user_question_1.makeAskUserQuestionTool,
    request_file_path: request_file_path_1.makeRequestFilePathTool,
    stream_image: stream_image_1.makeStreamImageTool,
};
function resolveToolFactory(toolRef) {
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
    const modPath = path.join(config_1.CONFIG.agentsRoot, "tools", "index");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(modPath);
    const factories = mod.toolFactories ?? {};
    const factory = factories[toolRef];
    if (!factory) {
        const available = Object.keys(factories).join(", ") || "(none)";
        throw new Error(`Unknown agent tool: "${toolRef}". ` +
            `Available: ${available}`);
    }
    return factory;
}
function instantiateTool(ref, sessionId, sessionRunPath) {
    const factory = resolveToolFactory(ref);
    return factory(sessionId, sessionRunPath);
}
function buildOrchestratorFromManifest(manifest, sessionId, sessionRunPath) {
    const llm = buildLlm();
    const backend = new deepagents_1.LocalShellBackend({
        rootDir: config_1.CONFIG.projectRoot,
        virtualMode: false,
        inheritEnv: true,
    });
    const orchTools = manifest.orchestrator.tools.map((t) => instantiateTool(t, sessionId, sessionRunPath));
    const subagentDicts = manifest.subagents.map((subagent) => ({
        name: subagent.name,
        description: subagent.description,
        systemPrompt: `${subagent.systemPrompt}\n\nsessionRunPath: ${sessionRunPath}`,
        tools: subagent.tools.map((t) => instantiateTool(t, sessionId, sessionRunPath)),
        skills: subagent.skills,
    }));
    const orchestrator = (0, deepagents_1.createDeepAgent)({
        model: llm,
        backend,
        skills: manifest.orchestrator.skills,
        subagents: subagentDicts,
        tools: orchTools,
        systemPrompt: manifest.orchestrator.systemPrompt,
        checkpointer: workflow_checkpointer_1.WORKFLOW_CHECKPOINTER,
    });
    return orchestrator;
}
