import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { createBunWebSocket } from "hono/bun";
import { authRouter } from "./routes/auth";
import { sessionsRouter } from "./routes/sessions";
import { filesRouter } from "./routes/files";
import { modelsRouter } from "./routes/models";
import { providersRouter } from "./routes/providers";
import { skillsRouter } from "./routes/skills";
import { envRouter } from "./routes/env";
import { onOpen, onClose, onMessage } from "./ws/handler";

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

app.get("/api/health", (c) => c.json({ status: "ok", time: Date.now() }));

app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onOpen,
    onMessage,
    onClose,
  }))
);

app.use("/assets/*", serveStatic({ root: "./public" }));
app.get("/*", serveStatic({ path: "./public/index.html" }));
app.get("/favicon.ico", serveStatic({ path: "./public/favicon.ico" }));

const port = parseInt(process.env.PORT ?? "3000");

const server = Bun.serve({
  fetch(req, server) {
    return app.fetch(req, { server });
  },
  port,
  websocket,
});

console.log(`Server running at http://0.0.0.0:${server.port}`);
