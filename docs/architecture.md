# CrewFactory Architecture

## Qwen Cloud Integration

```mermaid
flowchart LR
  subgraph USER["User"]
    U["Browser / CLI"]
  end

  subgraph CF["CrewFactory Platform"]
    SPA["React SPA (5173)"]

    subgraph BE["API Server (3000)"]
      REG["registerQwenProvider<br/>apps/server/src/core/providers/qwen-provider.ts"]
      LLM["ModelRegistry → Agent Class<br/>ReAct Loop · Tool Calls"]
      IMG["runImageGenModel<br/>apps/server/src/core/tools/image-gen-tool.ts"]
      CFG["user-config.ts<br/>Qwen model sync on API key save"]
    end

    subgraph DEPLOY["Alibaba Cloud Deployment"]
      ECS["ECS<br/>docker-compose up -d"]
      ACK["Container Service (ACK)<br/>ghcr.io/themikehage/crewfactory"]
      FC["Function Compute + OSS<br/>Serverless"]
    end

    OSS["OSS Upload Utility<br/>apps/server/src/alibaba-cloud/log-upload.ts<br/>Benchmark reports · HMAC-SHA1"]
  end

  subgraph ALIBABA["Alibaba Cloud Services"]
    DS_LLM["DashScope LLM API<br/>dashscope-intl.aliyuncs.com<br/>/compatible-mode/v1"]
    DS_AIGC["DashScope AIGC API<br/>dashscope-intl.aliyuncs.com<br/>/api/v1/services/aigc/"]
    OSS_SVC["Object Storage Service<br/>oss-cn-hangzhou.aliyuncs.com"]
  end

  U --> SPA
  SPA <-->|REST + WS| BE

  REG -->|"8 Qwen models<br/>qwen3.7-max, qwen3.7-plus<br/>qwen3.6-*, qwen3.5-*"| DS_LLM
  LLM -->|"OpenAI-compatible<br/>chat completions"| DS_LLM

  IMG -->|"Wan-Image, Qwen-Image<br/>Z-Image Turbo"| DS_AIGC

  CFG -.->|"auto-sync on key save"| REG

  BE -->|"benchmark reports<br/>experiment results"| OSS
  OSS -->|"PUT with HMAC-SHA1"| OSS_SVC

  DEPLOY -.->|"DASHSCOPE_API_KEY"| DS_LLM
  DEPLOY -.->|"DASHSCOPE_API_KEY"| DS_AIGC
  DEPLOY -.->|"ALIBABA_ACCESS_KEY_ID/SECRET"| OSS_SVC
```

## Server Internals

```mermaid
flowchart TB
  subgraph WS["WebSocket Layer"]
    direction TB
    W1["factory.ts<br/>Contextos · Cookie Auth"]
    W2["registry.ts<br/>Socket Maps · Cleanup"]
    W3["handler.ts<br/>Broadcast Facade"]
    W4["logger.ts<br/>Structured Logger"]
  end

  subgraph AUTH["Auth Layer"]
    A1["Better Auth (SQLite)<br/>Sesiones Cookie"]
    A2["middleware/auth.ts<br/>Session Validation"]
    A3["onboarding.ts<br/>Admin Setup"]
  end

  subgraph CORE["Core Services"]
    C1["SessionManager<br/>Lifecycle · Metadata · Prompts"]
    C2["TaskStateManager<br/>Cache · DAG · Atomic Writes"]
    C3["DecomposeTool<br/>DAG Plan Construction"]
    C4["EventBroker<br/>Log Buffer · Broadcast"]
    C5["AgentUtils<br/>Spawn · Delegate · Envelopes"]
  end

  subgraph ENTITIES["Entity Managers"]
    E1["AgentRegistry<br/>Programmatic Agents"]
    E2["ChannelStore + Orchestrator<br/>Multi-agent Dispatch"]
    E3["Team Managers<br/>Negotiation · Arbiter · Consensus"]
    E4["MCP Registry + Client<br/>Stdio/HTTP JSON-RPC"]
    E5["Preview System<br/>Build · Watch · Serve"]
  end

  subgraph AI["AI Runtime (Vendored)"]
    I1["ModelRegistry"]
    I2["Agent Class<br/>ReAct Loop · beforeToolCall"]
    I3["DefaultResourceLoader<br/>Skills · System Prompts"]
    I4["BashTool · Permission Engine"]
  end

  subgraph REST["API Routes"]
    R1["sessions.ts"]
    R2["providers.ts"]
    R3["files.ts"]
    R4["preview.ts"]
    R5["channels.ts"]
    R6["teams.ts"]
    R7["agents.ts"]
    R8["mcp.ts"]
    R9["backup.ts"]
    R10["experiments.ts"]
  end

  C1 --> I2
  E2 --> I2
  E3 --> I2
  R1 --> C1
  R2 --> I1
  R5 --> E2
  R6 --> E3
  R7 --> E1
  R8 --> E4
  R10 --> E3
  R4 --> E5
  C4 --> W3
  C5 --> E1
  C5 --> E2
```

## Key Qwen Cloud Models

| Model | Context | Thinking | Vision | Use Case |
|-------|---------|----------|--------|----------|
| qwen3.7-max | 128k | Yes | Yes | Complex reasoning, orchestration agents |
| qwen3.7-plus | 128k | Yes | No | Balanced performance/cost |
| qwen3.6-max-preview | 128k | Yes | Yes | Preview cutting-edge |
| qwen3.6-plus | 128k | Yes | No | Standard agent tasks |
| qwen3.6-flash | 128k | Yes | No | High-throughput, low-latency |
| qwen3.5-plus | 128k | Yes | No | Legacy stable |
| qwen3.5-flash | 128k | Yes | No | Fast inference |
| wan2.7-image-pro | — | — | — | Image generation (AIGC) |
| qwen-image-2.0-pro | — | — | — | Image generation (AIGC) |
| z-image-turbo | — | — | — | Fast image generation (AIGC) |

## Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM Provider | Qwen Cloud DashScope API (OpenAI-compatible) | Direct integration, no proxy, full Qwen model family |
| Image Gen | DashScope AIGC API with multi-endpoint fallback | Wan-Image, Qwen-Image, Z-Image Turbo; retries intl + cn endpoints |
| API Key Mgmt | Dynamic provider config via web UI | No env vars needed; auto-syncs models on key save |
| State Management | URL as source of truth + localStorage convenience | No cache invalidation, idempotent transitions, survives refresh |
| Real-Time | Singleton WebSocket + exponential backoff + offline queue | Prevents 3x connection overhead, handles network flakiness |
| Auth | httpOnly cookie-based (Better Auth) | No JS-accessible tokens, sync DB fallback for programmatic tokens |
| AI Runtime | Vendored Agent class in-process | Zero network overhead for agent loops, direct beforeToolCall hooks |
| Persistence | Filesystem-first + SQLite only for auth | Simple backup (zip), no DB migrations, easy inspection |
| Preview | Isolated port 3001 Bun.serve | No SPA/auth in preview URLs, framework-agnostic |
| MCP | Stdio/HTTP subprocess lifecycle | Workspace sandboxing via $WORKSPACE_DIR replacement |
| Multi-Agent | 4 composeable primitives (Spawn, Delegate, Negotiate, Arbitrate) | Replaces 7 legacy pathways with uniform protocol |

## Layer Responsibilities

| Layer | Key Modules | Responsibility |
|-------|-------------|----------------|
| WebSocket | factory.ts, registry.ts, handler.ts | Real-time bidirectional streaming with cookie auth, session/channel subscriptions |
| Auth | Better Auth, middleware/auth.ts | Cookie-based session management, first-run onboarding, programmatic tokens |
| Core | SessionManager, TaskStateManager, EventBroker | Agent lifecycle orchestration, task DAGs, log broadcasting |
| Entities | AgentRegistry, ChannelOrchestrator, Team managers, MCP | Entity-specific lifecycle, multi-agent dispatch, tool integration |
| AI Runtime | Vendored Agent class, ModelRegistry | ReAct loops, prompt composition, skill injection, permission hooks |
| Client | React Context, wsClient singleton, AG-UI components | State derived from URL, singleton WS connection, generative UI pipeline |

## Deployment on Alibaba Cloud

| Service | Method | Details |
|---------|--------|---------|
| ECS | `docker compose up -d` | Full control, persistent storage bind-mounts |
| ACK (K8s) | `ghcr.io/themikehage/crewfactory:latest` | Auto-scaling, service mesh |
| Function Compute | Serverless + OSS for state | Pay-per-invocation, stateless |
| OSS | `log-upload.ts` | HMAC-SHA1 signed PUTs, no SDK deps |
