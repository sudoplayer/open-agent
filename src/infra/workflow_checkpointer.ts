import { MemorySaver } from "@langchain/langgraph";

export const WORKFLOW_CHECKPOINTER = new MemorySaver();

export function releaseSessionCheckpoint(sessionId: string): void {
  WORKFLOW_CHECKPOINTER.deleteThread(sessionId).catch((e: unknown) => {
    console.warn(`releaseSessionCheckpoint(${sessionId}) error:`, e);
  });
}
