import { createHmac } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

interface OssUploadConfig {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  endpoint?: string;
}

interface UploadResult {
  url: string;
  key: string;
  statusCode: number;
}

function getOssEndpoint(config: OssUploadConfig): string {
  if (config.endpoint) return config.endpoint;
  return `https://${config.bucket}.oss-${config.region}.aliyuncs.com`;
}

function signString(secret: string, stringToSign: string): string {
  return createHmac("sha1", secret).update(stringToSign).digest("base64");
}

function buildOssHeaders(
  config: OssUploadConfig,
  method: string,
  objectKey: string,
  contentType: string,
  contentLength: number
): Record<string, string> {
  const date = new Date().toUTCString();
  const endpoint = getOssEndpoint(config);
  const resource = `/${config.bucket}/${objectKey}`;

  const stringToSign = [
    method,
    "",
    contentType,
    date,
    resource,
  ].join("\n");

  const signature = signString(config.accessKeySecret, stringToSign);
  const authorization = `OSS ${config.accessKeyId}:${signature}`;

  return {
    Authorization: authorization,
    Date: date,
    "Content-Type": contentType,
    "Content-Length": String(contentLength),
    Host: new URL(endpoint).host,
  };
}

export async function uploadToOss(
  config: OssUploadConfig,
  objectKey: string,
  content: string | Buffer,
  contentType: string = "application/json"
): Promise<UploadResult> {
  const endpoint = getOssEndpoint(config);
  const url = `${endpoint}/${objectKey}`;
  const body = typeof content === "string" ? Buffer.from(content, "utf-8") : content;

  const headers = buildOssHeaders(config, "PUT", objectKey, contentType, body.length);

  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: body as any,
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `OSS upload failed with status ${response.status}: ${errorText.slice(0, 200)}`
    );
  }

  return {
    url: `https://${config.bucket}.oss-${config.region}.aliyuncs.com/${objectKey}`,
    key: objectKey,
    statusCode: response.status,
  };
}

export function uploadFileToOss(
  config: OssUploadConfig,
  filePath: string,
  objectKey?: string
): Promise<UploadResult> {
  const stats = statSync(filePath);
  if (!stats.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }

  const content = readFileSync(filePath);
  const key = objectKey || basename(filePath);

  const contentType = filePath.endsWith(".json")
    ? "application/json"
    : filePath.endsWith(".html") || filePath.endsWith(".md")
      ? "text/html"
      : "application/octet-stream";

  return uploadToOss(config, key, content, contentType);
}

export function createOssConfigFromEnv(): OssUploadConfig {
  const accessKeyId = process.env.ALIBABA_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIBABA_ACCESS_KEY_SECRET;
  const bucket = process.env.OSS_BUCKET || "crewfactory-benchmarks";
  const region = process.env.OSS_REGION || "oss-cn-hangzhou";

  if (!accessKeyId) {
    throw new Error("ALIBABA_ACCESS_KEY_ID environment variable is required");
  }
  if (!accessKeySecret) {
    throw new Error("ALIBABA_ACCESS_KEY_SECRET environment variable is required");
  }

  return { accessKeyId, accessKeySecret, bucket, region };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const filePath = args[0];
  const objectKey = args[1];

  if (!filePath) {
    console.error("Usage: bun run log-upload.ts <file-path> [object-key]");
    process.exit(1);
  }

  try {
    const config = createOssConfigFromEnv();
    const result = await uploadFileToOss(config, filePath, objectKey);
    console.log(`Uploaded to: ${result.url}`);
    console.log(`Status: ${result.statusCode}`);
  } catch (err: any) {
    console.error(`Upload failed: ${err.message}`);
    process.exit(1);
  }
}
