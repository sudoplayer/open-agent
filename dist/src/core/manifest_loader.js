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
exports.loadManifest = loadManifest;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const config_1 = require("../config");
function skillRoot() {
    return path.join(config_1.CONFIG.agentsRoot, "skills");
}
function resolveSkillPaths(names) {
    const root = skillRoot();
    return names.map((name) => path.join(root, name));
}
function loadManifest() {
    const manifestPath = path.join(config_1.CONFIG.agentsRoot, "manifest.yaml");
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`Manifest not found: ${manifestPath}`);
    }
    const raw = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
    const orch = raw["orchestrator"] ?? {};
    const orchestrator = {
        systemPrompt: String(orch["system_prompt"] ?? ""),
        skills: resolveSkillPaths(orch["skills"] ?? []),
        tools: orch["tools"] ?? [],
    };
    const subagents = (raw["subagents"] ?? []).map((subagent) => {
        return {
            name: String(subagent["name"]),
            description: String(subagent["description"] ?? ""),
            systemPrompt: String(subagent["system_prompt"] ?? ""),
            skills: resolveSkillPaths(subagent["skills"] ?? []),
            tools: subagent["tools"] ?? [],
        };
    });
    return {
        id: String(raw["id"] ?? "id"),
        displayName: String(raw["display_name"] ?? "display_name"),
        modelId: String(raw["model_id"] ?? "model_id"),
        orchestrator,
        subagents,
    };
}
