import type { StreamEvent } from "@langchain/core/dist/tracers/event_stream";
import { CONFIG } from "config";
import { handleAgentStreamEvent } from "./agent_stream_utils";

export async function runUntilInterrupt(
  orchestrator: any,
  cmdOrInputs: unknown,
  sessionId: string
): Promise<void> {
  const config = { configurable: { thread_id: sessionId } };
  for await (const event of orchestrator.streamEvents(cmdOrInputs, {
    ...config,
    version: "v2",
    recursionLimit: CONFIG.recursionLimit,
  }) as AsyncIterable<StreamEvent>) {
    handleAgentStreamEvent(event, sessionId, true);
  }
}

export async function hasPendingInterrupt(
  orchestrator: any,
  sessionId: string
): Promise<boolean> {
  const config = { configurable: { thread_id: sessionId } };
  const snapshot = await orchestrator.getState(config);
  const tasks: Array<{ interrupts: unknown[] }> = snapshot?.tasks ?? [];
  return tasks.some(
    (t) => Array.isArray(t.interrupts) && t.interrupts.length > 0
  );
}

export async function isWorkflowDone(
  orchestrator: any,
  sessionId: string
): Promise<boolean> {
  const config = { configurable: { thread_id: sessionId } };
  const snapshot = await orchestrator.getState(config);
  const next: string[] = snapshot?.next ?? [];
  return next.length === 0;
}
