import type { AgentDefinition, AgentStatus } from "shared";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { Hono } from "hono";

export interface AgentServer {
  definition: AgentDefinition;
  session: AgentSession;
  app: Hono;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface AgentEntry {
  username: string;
  server: AgentServer;
  status: AgentStatus;
  createdAt: string;
}
