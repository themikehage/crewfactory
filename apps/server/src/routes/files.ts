import { Hono } from "hono";
import jwt from "jsonwebtoken";
import type { AuthPayload } from "../middleware/auth";

export const filesRouter = new Hono();

filesRouter.get("/sessions/:sessionId/files/*", async (c) => {
  const sessionId = c.req.param("sessionId");
  const filePath = c.req.param("*");

  if (!filePath) {
    return c.notFound();
  }

  if (filePath.includes("..")) {
    return c.text("Forbidden", 403);
  }

  let username: string | undefined;

  const tokenFromQuery = c.req.query("token");
  const authHeader = c.req.header("Authorization");

  if (tokenFromQuery) {
    try {
      const payload = jwt.verify(tokenFromQuery, process.env.JWT_SECRET!) as AuthPayload;
      username = payload.username;
    } catch {
      return c.text("Unauthorized", 401);
    }
  } else if (authHeader?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET!) as AuthPayload;
      username = payload.username;
    } catch {
      return c.text("Unauthorized", 401);
    }
  } else {
    return c.text("Unauthorized", 401);
  }

  const absolutePath = `/tmp/pi-web-users/${username}/sessions/${sessionId}/${filePath}`;
  const file = Bun.file(absolutePath);
  const exists = await file.exists();
  if (!exists) {
    return c.notFound();
  }

  const download = c.req.query("download");
  if (download === "1") {
    const fileName = filePath.split("/").pop() || "download";
    return new Response(file.stream(), {
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  }

  return c.body(file.stream());
});
