import type { AgentSession } from "../../ai";

export function enrichSessionWithMemory(session: AgentSession, memory: any): void {
  const originalPrompt = session.prompt.bind(session);
  session.prompt = async (message: string, opts?: any) => {
    const memCtx = await memory.buildContext(message);
    if (memCtx) session.injectMemoryContext(memCtx);
    return originalPrompt(message, opts);
  };
}
