import { createAuthEndpoint } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";

export const programmaticSessionPlugin = () => {
  return {
    id: "programmatic-session",
    endpoints: {
      createProgrammaticSession: createAuthEndpoint(
        "/programmatic-session/create",
        {
          method: "POST",
          metadata: { SERVER_ONLY: true },
        },
        async (ctx) => {
          const body = ctx.body as { userId: string; expiresIn?: number } | undefined;
          if (!body?.userId) {
            return ctx.json({ error: "userId required" }, { status: 400 });
          }

          const session = await ctx.context.internalAdapter.createSession(
            body.userId,
            false,
            body.expiresIn
              ? {
                  expiresAt: new Date(Date.now() + body.expiresIn * 1000),
                }
              : undefined
          );

          return ctx.json({ token: session.token, id: session.id });
        }
      ),
    },
  } satisfies BetterAuthPlugin;
};
