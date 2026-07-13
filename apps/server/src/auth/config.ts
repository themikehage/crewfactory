import { betterAuth } from "better-auth";
import { getDb } from "./db";
import { CREWFACTORY_DATA_PATH } from "shared";

export function createAuth() {
  const secret = getOrCreateSecret();
  const db = getDb();

  return betterAuth({
    database: db,
    secret,
    baseURL: process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 3000}`,
    trustedOrigins: getTrustedOrigins(),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    user: {
      additionalFields: {
        username: {
          type: "string",
          required: true,
          unique: true,
          input: true,
        },
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },
    advanced: {
      crossSubDomainCookies: {
        enabled: false,
      },
    },
  });
}

function getOrCreateSecret(): string {
  if (process.env.BETTER_AUTH_SECRET) {
    return process.env.BETTER_AUTH_SECRET;
  }

  const { existsSync, readFileSync, writeFileSync } = require("node:fs");
  const { join } = require("node:path");
  const { randomBytes } = require("node:crypto");

  const secretPath = join(CREWFACTORY_DATA_PATH(), ".auth-secret");
  if (existsSync(secretPath)) {
    return readFileSync(secretPath, "utf-8").trim();
  }

  const secret = randomBytes(32).toString("base64url");
  writeFileSync(secretPath, secret, { encoding: "utf-8", mode: 0o600 });
  console.log("[Auth] Generated new auth secret at", secretPath);
  return secret;
}

function getTrustedOrigins(): string[] {
  const origins: string[] = [];
  const url = process.env.BETTER_AUTH_URL;
  if (url) origins.push(url);
  origins.push(`http://localhost:${process.env.PORT || 3000}`);
  return origins;
}
