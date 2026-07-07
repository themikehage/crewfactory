import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const SALT = "crewfactory-env-salt-v1";
const IV_LENGTH = 12; // Estándar recomendado para GCM

function deriveKey(secret: string): Buffer {
  const hashKey = secret || "dev-fallback-secret-key-crewfactory-default-1234567890";
  return createHash("sha256")
    .update(hashKey + SALT)
    .digest();
}

export function encryptEnv(plaintext: string, jwtSecret: string): string {
  const key = deriveKey(jwtSecret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

export function decryptEnv(ciphertext: string, jwtSecret: string): string {
  const key = deriveKey(jwtSecret);
  const [ivHex, tagHex, encrypted] = ciphertext.split(":");
  
  if (!ivHex || !tagHex || !encrypted) {
    throw new Error("Invalid ciphertext format");
  }
  
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}
