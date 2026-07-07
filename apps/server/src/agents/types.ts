import type { AgentDefinition, AgentStatus } from "shared";
import type { AgentSession } from "../ai";
import type { Hono } from "hono";
import type { MemoryProvider } from "../core/engram/types";

export interface AgentServer {
  definition: AgentDefinition;
  session: AgentSession;
  app: Hono;
  memory: MemoryProvider;
  start(): Promise<void>;
  stop(): Promise<void>;
  getActiveObservers?(): number;
}

export interface AgentEntry {
  username: string;
  server: AgentServer;
  status: AgentStatus;
  createdAt: string;
}
