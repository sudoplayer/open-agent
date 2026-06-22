import * as path from "path";
import dotenv from "dotenv";

export const PROJECT_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

const API_PORT = Number(process.env.API_PORT ?? 8888);
const PUBLIC_API_BASE_URL = `http://127.0.0.1:${API_PORT}`;

function envFlag(name: string, defaultValue = false): boolean {
  const v = process.env[name];
  if (v === undefined) return defaultValue;
  return v === "1" || v.toLowerCase() === "true";
}

export interface IConfig {
  readonly projectRoot: string;
  readonly agentsRoot: string;
  readonly baseRunPath: string;
  readonly modelBaseUrl: string;
  readonly modelName: string;
  readonly llmApiKey?: string;
  readonly temperature: number;
  readonly thinkingEnabled: boolean;
  readonly recursionLimit: number;
  readonly maxSessions: number;
  readonly apiPort: number;
  readonly publicApiBaseUrl: string;
  readonly debugStream: boolean;
  readonly debugStreamDir: string;
  readonly checkpointDbPath: string;
  readonly checkpointRetentionDays: number;
  readonly checkpointVacuumIntervalMs: number;
  readonly memoryRoot: string;
  readonly memoryMaxChars: number;
}

class Config implements IConfig {
  readonly projectRoot = PROJECT_ROOT;
  readonly agentsRoot = path.join(PROJECT_ROOT, "agents");
  readonly baseRunPath = path.join(PROJECT_ROOT, "runs");
  readonly modelBaseUrl = process.env.MODEL_BASE_URL ?? "https://api.deepseek.com";
  readonly modelName = process.env.MODEL_NAME ?? "deepseek-v4-flash";
  readonly llmApiKey = process.env.LLM_API_KEY;
  readonly temperature = 0;
  readonly thinkingEnabled = false;
  readonly recursionLimit = 1000;
  readonly maxSessions = 1000;
  readonly apiPort = API_PORT;
  readonly publicApiBaseUrl = PUBLIC_API_BASE_URL;
  readonly debugStream = envFlag("DEBUG_STREAM", false);
  readonly debugStreamDir =
    process.env.DEBUG_STREAM_DIR ?? path.join(PROJECT_ROOT, "debug");
  readonly checkpointDbPath =
    process.env.CHECKPOINT_DB_PATH ?? "data/checkpoints.sqlite";
  readonly checkpointRetentionDays = Number(
    process.env.CHECKPOINT_RETENTION_DAYS ?? 7
  );
  readonly checkpointVacuumIntervalMs =
    Number(process.env.CHECKPOINT_VACUUM_INTERVAL_HOURS ?? 6) * 60 * 60 * 1000;
  readonly memoryRoot = "memory";
  readonly memoryMaxChars = 500;
}

export const CONFIG: IConfig = new Config();
