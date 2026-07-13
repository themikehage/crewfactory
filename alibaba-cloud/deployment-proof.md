# Alibaba Cloud Deployment Proof

## Overview

CrewFactory uses **Alibaba Cloud DashScope API** as its primary Qwen model provider. All Qwen model inference is routed directly through `dashscope-intl.aliyuncs.com` (Alibaba Cloud's international API gateway) without any intermediary proxy.

## Code Evidence

### 1. Qwen Provider — Direct DashScope API Calls

**File:** `apps/server/src/core/providers/qwen-provider.ts`

```typescript
const QWEN_PROVIDER = {
  name: "Qwen Cloud",
  baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  apiKeyEnv: "DASHSCOPE_API_KEY",
  models: [
    { id: "qwen3.7-max", name: "Qwen 3.7 Max", contextWindow: 131072, thinking: true, vision: true },
    { id: "qwen3.7-plus", name: "Qwen 3.7 Plus", contextWindow: 131072, thinking: true },
    { id: "qwen3.6-max-preview", name: "Qwen 3.6 Max Preview", contextWindow: 131072, thinking: true },
    { id: "qwen3.6-plus", name: "Qwen 3.6 Plus", contextWindow: 131072, thinking: true },
    { id: "qwen3.6-flash", name: "Qwen 3.6 Flash", contextWindow: 131072, thinking: true },
    { id: "qwen3.5-plus", name: "Qwen 3.5 Plus", contextWindow: 131072, thinking: true },
    { id: "qwen3.5-flash", name: "Qwen 3.5 Flash", contextWindow: 131072, thinking: true },
  ],
};
```

All 8 Qwen models use DashScope's OpenAI-compatible endpoint at `dashscope-intl.aliyuncs.com/compatible-mode/v1`.

### 2. Image Generation — Direct Alibaba Cloud AIGC API

**File:** `apps/server/src/core/tools/image-gen-tool.ts`

```typescript
const DASHSCOPE_ENDPOINTS = [
  "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
];

// Wan-Image Pro models use:
// https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/wan2.7-image-pro/generation

// Z-Image Turbo models use:
// https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/z-image-turbo/generation
```

Image generation models (Wan-Image Pro, Qwen-Image 2.0 Pro, Z-Image Turbo) call Alibaba Cloud's AIGC service APIs directly.

### 3. Environment Configuration

**File:** `.env.example`

```bash
DASHSCOPE_API_KEY=${DASHSCOPE_API_KEY:-}
```

**File:** `docker-compose.yml`

```yaml
environment:
  - DASHSCOPE_API_KEY=${DASHSCOPE_API_KEY:-}
```

## OSS Log Upload Utility

**File:** `apps/server/src/alibaba-cloud/log-upload.ts`

A dedicated utility that uploads benchmark reports and experiment results to Alibaba Cloud OSS (Object Storage Service). Uses the OSS REST API directly via `fetch()` — no additional SDK dependencies required.

### Features
- Uploads JSON reports to a configurable OSS bucket
- Supports HMAC-SHA1 signature for authentication
- Handles large files with streaming upload
- Configurable via `ALIBABA_ACCESS_KEY_ID` and `ALIBABA_ACCESS_KEY_SECRET` environment variables

### Usage
```bash
# Set credentials
export ALIBABA_ACCESS_KEY_ID=your-key-id
export ALIBABA_ACCESS_KEY_SECRET=your-key-secret

# Upload a benchmark report
bun run apps/server/src/alibaba-cloud/log-upload.ts \
  --bucket crewfactory-benchmarks \
  --file /tmp/crewfactory/user/experiments/exp-001/runs/run-001.json \
  --key experiments/2026/run-001.json
```

## Deployment

CrewFactory is containerized and can run on any Alibaba Cloud compute service:

### Option 1: Elastic Compute Service (ECS)
```bash
# On an Alibaba Cloud ECS instance
git clone https://github.com/themikehage/crewfactory
cd crewfactory
echo "DASHSCOPE_API_KEY=sk-your-key" > .env
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
docker compose up -d
```

### Option 2: Function Compute + OSS
The backend can be deployed as a serverless function with OSS for state storage.

### Option 3: Container Service (ACK)
The pre-built Docker image is available at `ghcr.io/themikehage/crewfactory:latest`.

## Screenshots

[Placeholder — Add screenshots showing:]
- DashScope API console with active API key
- Running ECS instance in Alibaba Cloud Console
- OSS bucket with uploaded benchmark reports
- Live CrewFactory dashboard showing Qwen model in use

## Repository Links

- **Qwen Provider (DashScope integration):** [apps/server/src/core/providers/qwen-provider.ts](../apps/server/src/core/providers/qwen-provider.ts)
- **Image Generation (AIGC API calls):** [apps/server/src/core/tools/image-gen-tool.ts](../apps/server/src/core/tools/image-gen-tool.ts)
- **OSS Upload Utility:** [apps/server/src/alibaba-cloud/log-upload.ts](../apps/server/src/alibaba-cloud/log-upload.ts)
- **Environment Config:** [.env.example](../.env.example)
- **Docker Deployment:** [docker-compose.yml](../docker-compose.yml)
