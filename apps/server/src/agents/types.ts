import type { AgentDefinition, AgentStatus } from "shared";
import type { AgentSession } from "../ai";
import type { Hono } from "hono";

export interface AgentServer {
  definition: AgentDefinition;
  session: AgentSession;
  app: Hono;
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
