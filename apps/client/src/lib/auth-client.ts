import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
});

export type Session = typeof authClient.$Infer.Session;
