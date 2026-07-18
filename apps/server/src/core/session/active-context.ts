import { AsyncLocalStorage } from "node:async_hooks";

export interface ActiveContext {
  username: string;
  sessionId: string;
}

export const activeContextStorage = new AsyncLocalStorage<ActiveContext>();
