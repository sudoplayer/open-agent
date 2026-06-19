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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG = exports.PROJECT_ROOT = void 0;
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
exports.PROJECT_ROOT = path.resolve(__dirname, "..");
dotenv_1.default.config({ path: path.join(exports.PROJECT_ROOT, ".env") });
const API_PORT = Number(process.env.API_PORT ?? 8888);
const PUBLIC_API_BASE_URL = `http://127.0.0.1:${API_PORT}`;
class Config {
    projectRoot = exports.PROJECT_ROOT;
    agentsRoot = path.join(exports.PROJECT_ROOT, "agents");
    baseRunPath = path.join(exports.PROJECT_ROOT, "runs");
    modelBaseUrl = process.env.MODEL_BASE_URL ?? "https://api.deepseek.com";
    modelName = process.env.MODEL_NAME ?? "deepseek-v4-flash";
    llmApiKey = process.env.LLM_API_KEY;
    temperature = 0;
    thinkingEnabled = false;
    recursionLimit = 1000;
    maxSessions = 1000;
    apiPort = API_PORT;
    publicApiBaseUrl = PUBLIC_API_BASE_URL;
}
exports.CONFIG = new Config();
