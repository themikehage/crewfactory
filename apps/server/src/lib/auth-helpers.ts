import jwt from "jsonwebtoken";
import type { AuthPayload } from "../middleware/auth";

export function getUsername(c: any): string | null {
  const tokenFromQuery = c.req.query("token");
  const authHeader = c.req.header("Authorization");
  let token = "";

  if (tokenFromQuery) {
    token = tokenFromQuery;
  } else if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    return null;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
    return payload.username;
  } catch {
    return null;
  }
}
