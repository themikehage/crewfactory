import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { createBunWebSocket } from "hono/bun";
import { existsSync } from "node:fs";
import { authRouter } from "./routes/auth";
import { sessionsRouter } from "./routes/sessions";
import { filesRouter } from "./routes/files";
import { modelsRouter } from "./routes/models";
import { providersRouter } from "./routes/providers";
import { skillsRouter } from "./routes/skills";
import { envRouter } from "./routes/env";
import { integrationsRouter } from "./routes/integrations";
import { agentsRouter } from "./routes/agents";
import { channelsRouter } from "./routes/channels";
import { previewRouter } from "./routes/preview";
import { backupRouter } from "./routes/backup";
import { logsRouter } from "./routes/logs";
import { mcpRouter } from "./routes/mcp";
import { experimentsRouter } from "./routes/experiments";
import { settingsRouter } from "./routes/settings";
import { galleryRouter } from "./routes/gallery";
import { memoryRegistry } from "./core/memory/registry";
import { onOpen, onClose, onMessage } from "./ws/handler";
import { startPreviewServer, handleRequest as previewRequest } from "./preview-server";

const PREVIEW_HOST = (process.env.PREVIEW_HOST ?? "").toLowerCase();

const { upgradeWebSocket, websocket } = createBunWebSocket();

const app = new Hono();

app.use("/*", cors());
app.use("/*", logger());

app.route("/api/auth", authRouter);
app.route("/api/sessions", sessionsRouter);
app.route("/api", filesRouter);
app.route("/api/models", modelsRouter);
app.route("/api/providers", providersRouter);
app.route("/api/skills", skillsRouter);
app.route("/api/env", envRouter);
app.route("/api/integrations", integrationsRouter);
app.route("/api/preview", previewRouter);
app.route("/api/agents", agentsRouter);
app.route("/api/channels", channelsRouter);
app.route("/api/backup", backupRouter);
app.route("/api/logs", logsRouter);
app.route("/api/mcp", mcpRouter);
app.route("/api/experiments", experimentsRouter);
app.route("/api/settings", settingsRouter);
app.route("/api/gallery", galleryRouter);

app.get("/api/health", (c) => c.json({ status: "ok", time: Date.now() }));

app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onOpen,
    onMessage,
    onClose,
  }))
);

const STATIC_EXTENSIONS = /\.(webmanifest|js|json|png|ico|svg|css)$/;

app.use("/assets/*", serveStatic({ root: "./public" }));
app.use(async (c, next) => {
  if (STATIC_EXTENSIONS.test(c.req.path) && existsSync(`./public${c.req.path}`)) {
    return serveStatic({ root: "./public" })(c, next);
  }
  await next();
});
app.get("/*", serveStatic({ path: "./public/index.html" }));

const port = parseInt(process.env.PORT ?? "3000");

const server = Bun.serve({
  fetch(req, server) {
    const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0];
    if (PREVIEW_HOST && host === PREVIEW_HOST) {
      return previewRequest(req);
    }
    return app.fetch(req, { server });
  },
  port,
  websocket,
});

console.log(`Server running at http://0.0.0.0:${server.port}`);

if (!PREVIEW_HOST) startPreviewServer();

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down memory providers...");
  await memoryRegistry.shutdownAll();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down memory providers...");
  await memoryRegistry.shutdownAll();
  process.exit(0);
});

