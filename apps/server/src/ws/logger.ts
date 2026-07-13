type LogLevel = "info" | "warn" | "error" | "debug";

interface LogContext {
  wsId?: string;
  username?: string;
  sessionId?: string;
  [key: string]: unknown;
}

function formatMessage(level: LogLevel, message: string, ctx?: LogContext): string {
  const parts: string[] = [`[WS][${level.toUpperCase()}]`, message];
  if (ctx?.wsId) parts.push(`wsId=${ctx.wsId}`);
  if (ctx?.username) parts.push(`user=${ctx.username}`);
  if (ctx?.sessionId) parts.push(`session=${ctx.sessionId}`);
  return parts.join(" ");
}

export const wsLogger = {
  info(message: string, ctx?: LogContext) {
    console.log(formatMessage("info", message, ctx));
  },
  warn(message: string, ctx?: LogContext) {
    console.warn(formatMessage("warn", message, ctx));
  },
  error(message: string, ctx?: LogContext & { error?: unknown }) {
    const { error, ...rest } = ctx ?? {};
    console.error(formatMessage("error", message, rest), error ?? "");
  },
  debug(message: string, ctx?: LogContext) {
    if (process.env.NODE_ENV !== "production") {
      console.debug(formatMessage("debug", message, ctx));
    }
  },
};
