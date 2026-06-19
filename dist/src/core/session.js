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
exports.SessionStore = exports.SessionEntry = void 0;
exports.buildSessionId = buildSessionId;
exports.createWorkflowSession = createWorkflowSession;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_1 = require("config");
const agent_factory_1 = require("core/agent_factory");
const manifest_loader_1 = require("core/manifest_loader");
const workflow_checkpointer_1 = require("infra/workflow_checkpointer");
const stream_manager_1 = require("infra/stream_manager");
function buildSessionId(userId, chatId) {
    const raw = `${userId}:${chatId}`;
    return crypto.createHash("sha256").update(raw, "utf-8").digest("hex").slice(0, 32);
}
function createWorkflowSession() {
    return { sessionId: "", sessionRunPath: "" };
}
class SessionEntry {
    session;
    _orchestrator = null;
    constructor(session) {
        this.session = session;
        if (session.sessionRunPath) {
            fs.mkdirSync(session.sessionRunPath, { recursive: true });
        }
    }
    getOrchestrator() {
        if (this._orchestrator === null) {
            const manifest = (0, manifest_loader_1.loadManifest)();
            this._orchestrator = (0, agent_factory_1.buildOrchestratorFromManifest)(manifest, this.session.sessionId, this.session.sessionRunPath);
        }
        return this._orchestrator;
    }
}
exports.SessionEntry = SessionEntry;
class SessionStore {
    _store = new Map();
    _max;
    _insertOrder = [];
    constructor() {
        this._max = config_1.CONFIG.maxSessions;
    }
    lookup(sessionId) {
        const entry = this._store.get(sessionId);
        if (!entry)
            return undefined;
        this.touch(sessionId);
        return entry;
    }
    touch(sessionId) {
        const idx = this._insertOrder.indexOf(sessionId);
        if (idx >= 0) {
            this._insertOrder.splice(idx, 1);
            this._insertOrder.push(sessionId);
        }
    }
    evictOldest() {
        const oldestId = this._insertOrder.shift();
        if (oldestId) {
            this._store.delete(oldestId);
            (0, workflow_checkpointer_1.releaseSessionCheckpoint)(oldestId);
            stream_manager_1.streamManager.endStream(oldestId);
        }
    }
    getOrCreate(sessionId) {
        const existing = this._store.get(sessionId);
        if (existing) {
            this.touch(sessionId);
            return existing;
        }
        const session = createWorkflowSession();
        session.sessionId = sessionId;
        session.sessionRunPath = path.join(config_1.CONFIG.baseRunPath, sessionId);
        const entry = new SessionEntry(session);
        this._store.set(sessionId, entry);
        this._insertOrder.push(sessionId);
        if (this._store.size > this._max) {
            this.evictOldest();
        }
        return entry;
    }
}
exports.SessionStore = SessionStore;
