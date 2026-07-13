COMPLETED
# WebFetch Tool — Security & Performance Analysis

## Overview

Tool `web_fetch` que permite al agente LLM obtener el contenido de paginas web arbitrarias como **Markdown limpio** para procesamiento. Usa `@mozilla/readability` para extraer solo el contenido principal (modo Firefox Reader) y `turndown` para convertir a Markdown estructurado. Sin JS rendering — solo paginas server-rendered, que cubren el ~95% de los casos de uso de un agente.

### Por que existe `exa_search` y necesitamos `web_fetch` tambien

| | `exa_search` | `web_fetch` |
|---|---|---|
| Proposito | Busqueda semantica (query → lista URLs) | Fetch directo de una URL concreta |
| Fuente de URLs | API de Exa (servicio externo) | URL arbitraria dada por el agente |
| Alcance | Solo web publica indexada | Cualquier URL accesible (incluso internas si no se bloquea) |
| Dependencia | Requiere `EXA_API_KEY` | Sin dependencias externas (solo red) |

Ambos se complementan: el agente busca con `exa_search`, obtiene URLs, y luego usa `web_fetch` para extraer el contenido completo de las paginas seleccionadas.

---

## 1. Security Analysis

### 1.1 SSRF (Server-Side Request Forgery)

**Riesgo**: El agente podria usar `web_fetch` contra servicios internos (`localhost`, `10.x.x.x`, `169.254.x.x`, metadata clouds, etc.).

**Estado actual del codebase**: CERO proteccion SSRF. Ninguna tool valida IPs destino. `exa-search-tool.ts` hardcodea la URL a `api.exa.ai`. `mcp-client.ts` y `model-registry.ts` fetchean URLs de configuracion sin validar.

**Solucion — URL/IP validation layer:**

```typescript
// apps/server/src/core/tools/web-fetch/security.ts

const BLOCKED_HOSTS = new Set([
  "localhost", "127.0.0.1", "0.0.0.0", "[::1]", "[::]",
]);

const BLOCKED_CIDRS = [
  "10.0.0.0/8",      // Private (Class A)
  "172.16.0.0/12",   // Private (Class B)
  "192.168.0.0/16",  // Private (Class C)
  "169.254.0.0/16",  // Link-local (AWS metadata)
  "100.64.0.0/10",   // Carrier-grade NAT
  "fc00::/7",        // IPv6 unique local
];

const BLOCKED_METADATA_HOSTS = [
  "metadata.google.internal",  // GCP
  "169.254.169.254",           // AWS / Azure / GCP
  "metadata.tencentyun.com",   // Tencent
  "100.100.100.200",           // Alibaba
];

function validateUrl(urlString: string): { valid: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }

  // Block non-HTTP schemes
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, reason: `Blocked protocol: ${parsed.protocol}` };
  }

  // Block known-dangerous hosts
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) {
    return { valid: false, reason: `Blocked host: ${hostname}` };
  }
  if (BLOCKED_METADATA_HOSTS.includes(hostname) || BLOCKED_METADATA_HOSTS.includes(parsed.host)) {
    return { valid: false, reason: "Blocked cloud metadata endpoint" };
  }

  // Resolve DNS and check against private CIDRs
  // (done in the fetch phase, see 1.2 DNS Rebinding)
  return { valid: true };
}
```

### 1.2 DNS Rebinding Protection

**Riesgo**: Un atacante configura un dominio que resuelve a `1.2.3.4` (publico) en la validacion inicial, pero en el fetch real resuelve a `127.0.0.1` (privado).

**Solucion**: Se resuelve DNS una sola vez via `Bun.dns.lookup()`, se valida la IP contra los CIDRs bloqueados, y se usa la IP resuelta directamente en el `fetch()` con header `Host` original:

```typescript
async function resolveAndValidate(urlString: string): Promise<{
  valid: false; reason: string;
} | {
  valid: true; ip: string; hostname: string; url: URL;
}> {
  const parsed = new URL(urlString);
  const { address } = await dns.lookup(parsed.hostname, { family: "ipv4" });
  
  if (isPrivateIp(address)) {
    return { valid: false, reason: `Private IP detected: ${address}` };
  }
  
  return { valid: true, ip: address, hostname: parsed.hostname, url: parsed };
}

function isPrivateIp(ip: string): boolean {
  // Check against all BLOCKED_CIDRS using ip-range-check or manual bit masking
  // Bun ships with node:net — use net.isIP(ip) first, then manual CIDR check
}
```

### 1.3 URL Redirect Following

**Riesgo**: `fetch()` sigue redirects automaticamente. Un servidor publico podria redirigir a `http://169.254.169.254/latest/meta-data/`.

**Solucion**: `fetch(url, { redirect: "manual" })` para NO seguir automaticamente. Seguir manualmente con un maximo de N redirects (3-5), re-validando cada URL destino contra el SSRF blocker:

```typescript
async function safeFetch(url: string, signal?: AbortSignal): Promise<Response> {
  let currentUrl = url;
  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    const { valid, ip, hostname } = await resolveAndValidate(currentUrl);
    if (!valid) throw new Error(`SSRF blocked at hop ${hop}`);
    
    const response = await fetch(currentUrl, {
      signal,
      redirect: "manual",  // Don't auto-follow
      headers: {
        "Host": hostname,
        "User-Agent": USER_AGENT,
        "Accept": "text/html, text/plain, application/json, application/xml;q=0.9, */*;q=0.1",
      },
    });
    
    const redirectUrl = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && redirectUrl) {
      currentUrl = new URL(redirectUrl, currentUrl).toString();
      continue;  // Next hop
    }
    
    return response;  // Terminal response
  }
  throw new Error("Too many redirects");
}
```

### 1.4 Content-Type Validation & Size Limits

**Riesgo**: El agente intenta fetchear un binario de 2GB o un video/audio.

**Solucion**: Validacion pre-fetch via HEAD request (opcional, configurable) y post-fetch via `Content-Length` + `Content-Type` headers:

```typescript
const MAX_CONTENT_LENGTH = 10 * 1024 * 1024;  // 10MB max per fetch
const ALLOWED_CONTENT_TYPES = [
  "text/html", "text/plain", "application/json",
  "application/xml", "text/xml", "text/markdown",
  "text/csv", "application/javascript",
];

function validateResponse(response: Response): { valid: boolean; reason?: string } {
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_CONTENT_LENGTH) {
    return { valid: false, reason: `Content too large: ${contentLength} bytes` };
  }
  
  const contentType = response.headers.get("content-type") || "";
  const mimeType = contentType.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.some(t => mimeType.startsWith(t)) &&
      !mimeType.startsWith("text/")) {
    return { valid: false, reason: `Blocked content type: ${mimeType}` };
  }
  
  return { valid: true };
}
```

### 1.5 Contenido malicioso en el output

**Riesgo**: El HTML/JSON obtenido podria contener scripts, payloads XSS, o prompt injection dirigido al LLM.

**Solucion**: `@mozilla/readability` elimina por diseno todo el contenido no-semantico (scripts, estilos, iframes, navs, sidebars) antes de que llegue al LLM. `turndown` convierte solo contenido estructural (headings, parrafos, links, listas, code blocks) — ignora cualquier tag desconocido. Si readability falla, el fallback regex HTML→text hace strip de tags y caracteres de control.

```typescript
// HTML → text conversion (regex fallback, solo si readability falla)
function htmlToText(html: string): string {
  return html
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")          // strip tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d)))
    .replace(/\s{2,}/g, "\n")          // collapse whitespace
    .replace(/\n{3,}/g, "\n\n")        // collapse blank lines
    .trim();
}
```

### 1.6 Rate Limiting & Concurrency

**Riesgo**: El agente podria hacer fetch a 50 URLs simultaneamente (DDoS a un servidor objetivo).

**Solucion**: Rate limiter in-process con sliding window:

```typescript
const rateLimiter = {
  maxRequestsPerMinute: 30,
  maxConcurrent: 3,
  window: new Map<string, number[]>(),  // hostname → timestamps[]
  
  async acquire(hostname: string): Promise<void> {
    // Block if > maxRequestsPerMinute to same host in last 60s
    // Block if already maxConcurrent in-flight
    // Otherwise add timestamp and proceed
  },
  
  release(hostname: string): void {
    // Remove from in-flight counter
  },
};
```

### 1.7 Resumen de capas de seguridad

```
                  ┌─────────────────────────────┐
 Request URL     │ 1. URL Schema Validation     │ → solo http/https
        │         │ 2. Hostname Blocklist        │ → localhost, metadata endpoints
        ▼         │ 3. DNS Resolution + IP Check │ → bloquea CIDRs privados
   DNS Lookup    │-------------------------------------------------
        │         │ 4. safeFetch() c/ redirect manual │ → revalida cada hop
        ▼         │ 5. Content-Type Validation          │ → solo text/*
   HTTP Fetch    │ 6. Content-Length Check              │ → max 10MB
        │         │ 7. Stream Read con byte limit        │ → abort si excede
   Read Body     │-------------------------------------------------
        │         │ 8. parseHTML (linkedom)              │ → DOM ligero
        ▼         │ 9. Readability.parse()               │ → extrae articulo principal
   Extraction    │ 10. turndown (HTML → Markdown)        │ → Markdown estructurado
        │         │ 11. Fallback regex HTML→text          │ → si readability falla
        ▼         │-------------------------------------------------
   Post-process  │ 12. truncateHead() 100KB              │ → limite para LLM
        │         │ 13. Rate Limiting                     │ → 30/min, 3 concurrent
        ▼         │ 14. Output Filtering                  │ → strip secrets de URL
   AgentToolResult└─────────────────────────────┘
```

---

## 2. Performance Considerations

### 2.1 Caching Layer

**Problema**: El agente frecuentemente refetchea la misma URL (ej: documentacion de una API, README de un repo).

**Solucion**: Cache en memoria con TTL, opcionalmente en disco:

```typescript
interface CacheEntry {
  url: string;
  content: string;          // Texto convertido
  contentType: string;
  fetchedAt: number;
  etag?: string;
  lastModified?: string;
}

class WebFetchCache {
  private memory = new Map<string, CacheEntry>();
  private maxEntries = 200;
  private ttlMs = 5 * 60 * 1000;  // 5 min default
  
  get(url: string): CacheEntry | null { ... }
  set(url: string, entry: CacheEntry): void { ... }
  invalidate(url: string): void { ... }
  prune(): void { ... }  // LRU eviction
}
```

**Estrategia de cache**:
- **Cache hit** (fresh): Retorna contenido cacheado inmediatamente
- **Cache hit** (stale): Retorna cacheado + re-fetch en background para refrescar
- **Conditional fetch**: Si tenemos `etag` o `Last-Modified`, enviar `If-None-Match` / `If-Modified-Since` para ahorrar bandwidth

### 2.2 Timeouts

```typescript
const DEFAULT_TIMEOUT = 15000;  // 15s per fetch
const DNS_TIMEOUT = 3000;       // 3s for DNS resolution

async function fetchWithTimeout(url: string, ms: number, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  
  // Merge external signal with timeout signal
  if (signal) {
    signal.addEventListener("abort", () => controller.abort());
  }
  
  try {
    return await fetch(url, { signal: controller.signal, ... });
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### 2.3 Content Extraction Pipeline

El pipeline optimizado extrae solo el contenido relevante, eliminando navbars, sidebars, ads, footers:

```
Response recibida (HTML crudo)
  ↓
Check Content-Length → si > 10MB, abort download
  ↓
Stream read body with byte limit (max 10MB)
  ↓
parseHTML() via linkedom → lightweight DOM (~100KB, sin binarios)
  ↓
new Readability(doc).parse() → extrae articulo principal (Firefox Reader Mode algorithm)
  │  { title, content: "<h1>...</h1><p>...</p>", textContent, excerpt, siteName }
  │  Si falla: fallback a regex HTML→text del plan original
  ↓
turndownService.turndown(article.content) → HTML a Markdown
  │  { h1 → #, p → \n\n, a → [text](url), code → ```, strong → **, li → -, table → markdown table }
  ↓
truncateHead() a 100KB (~25K tokens para el LLM)
  ↓
Return AgentToolResult con titulo + markdown + metadata
```

**Por que este pipeline vs regex:**

| Metrica | Regex (plan original) | Readability + Turndown (plan actual) |
|---------|----------------------|-------------------------------------|
| % de ruido en output | ~80% en sitio promedio | ~5% |
| Tokens enviados al LLM | ~80KB crudo por pagina | ~15-20KB puro |
| Estructura en output | Texto plano | Markdown con headings, listas, links, code blocks |
| Fallback si falla | — | Degrada a regex, mismo comportamiento que plan original |

### 2.4 Stream Read con Byte Limit

Para evitar descargar archivos enormes:

```typescript
async function readResponseBody(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  
  let totalBytes = 0;
  const chunks: Uint8Array[] = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.length;
    if (totalBytes > maxBytes) {
      reader.cancel();  // Stop downloading!
      chunks.push(value.slice(0, maxBytes - (totalBytes - value.length)));
      break;
    }
    chunks.push(value);
  }
  
  const decoder = new TextDecoder();
  return chunks.map(c => decoder.decode(c, { stream: true })).join("");
}
```

### 2.5 Resumen de metricas de performance

| Metrica | Target |
|---------|--------|
| Response time (cache hit) | < 5ms |
| Response time (cache miss) | < 2s para paginas tipicas |
| DNS resolution | < 500ms (con Bun nativo) |
| Max content size in memory | 10MB (descarga), 100KB (texto procesado para LLM) |
| Concurrent fetches | Max 3 global |
| Cache TTL | 5 min por defecto, configurable por URL |
| Cache size | 200 entries max, LRU eviction |

---

## 3. Implementation Architecture

### 3.1 File Structure

```
apps/server/src/core/tools/web-fetch/
  security.ts              ← URL validation, SSRF/DNS rebinding blockers, redirect validation
  cache.ts                 ← In-memory cache with TTL, ETag, conditional fetch
  extractor.ts             ← readability + turndown pipeline, fallback regex HTML→text
  rate-limiter.ts          ← Sliding window per-host rate limiter
  web-fetch-tool.ts        ← Tool definition factory (createWebFetchTool)
  index.ts                 ← Barrel export
```

### 3.2 Tool Schema

```typescript
{
  name: "web_fetch",
  label: "Web Fetch",
  description: "Fetch and extract text content from a web URL. Returns cleaned, sanitized text suitable for LLM processing.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to fetch. Must be http or https."
      },
      extractMode: {
        type: "string",
        enum: ["auto", "text", "markdown"],
        default: "auto",
        description: "auto=readability+markdown (best), text=plain text extraction, markdown=force markdown conversion"
      },
      maxChars: {
        type: "integer",
        default: 50000,
        minimum: 1000,
        maximum: 100000,
        description: "Maximum characters to return to the LLM context"
      },
      forceRefresh: {
        type: "boolean",
        default: false,
        description: "If true, bypass cache and refetch"
      }
    },
    required: ["url"]
  },
  execute: async (toolCallId, args, signal) => {
    // 1. Validate URL (security.ts:validateUrl)
    // 2. Check cache if !forceRefresh (cache.ts)
    // 3. Rate limit check (rate-limiter.ts)
    // 4. DNS resolve + SSRF check (security.ts:resolveAndValidate)
    // 5. safeFetch with timeout + redirect tracking
    // 6. Validate content-type + size
    // 7. Stream read body with byte limit
    // 8. parseHTML (linkedom) + Readability → extraer articulo principal
    // 9. turndownService → HTML a Markdown estructurado
    // 10. Fallback: si readability falla, regex HTML→text
    // 11. Truncate final text with truncateHead (100KB limit)
    // 12. Store in cache
    // 13. Return AgentToolResult with markdown + metadata
  }
}
```

### 3.3 AgentToolResult Shape

```typescript
{
  content: [{
    type: "text",
    text: "# Example Page\n\nContent paragraph **with bold**...\n\n- List item 1\n- List item 2"  // Markdown for LLM
  }],
  details: {
    url: "https://example.com",
    title: "Example Page",         // Extracted <title>
    contentType: "text/html",
    originalSize: 207543,           // Bytes before extraction
    extractedSize: 14230,           // Bytes after readability + turndown
    truncated: false,               // true if content was truncated
    cached: false,                  // true if served from cache
    fetchDurationMs: 342,           // Time taken
    statusCode: 200,
    siteName: "Example Site",       // From readability
    excerpt: "This page is about...", // From readability
    extractionMethod: "readability", // "readability" | "regex-fallback"
  }
}
```

### 3.4 Integration Points

| Archivo | Cambio |
|---------|--------|
| `apps/server/src/core/session/tool-factory.ts` | Importar `createWebFetchTool`, añadir a `customTools` |
| `packages/shared/src/schemas.ts` | Añadir `"web_fetch"` a `AVAILABLE_TOOLS` |
| `apps/client/src/components/chat/tools/ToolCallRow.tsx` | Añadir `web_fetch` a `TOOL_META` con icono de globo/link |
| `apps/server/src/ws/handler.ts` | Preservar `web_fetch` en WebSocket prompt override |
| `apps/server/src/ai/vendor/agent/src/harness/utils/truncate.ts` | Reutilizar `truncateHead()` existente |

### 3.5 Frontend Rendering

Añadir a `ToolCallRow.tsx`:

```typescript
case "web_fetch":
  return <WebFetchResult
    text={text}
    details={result?.details}
    l={l}
  />;
```

`WebFetchResult.tsx`: Tarjeta compacta mostrando:
- Titulo de la pagina (extracted `<title>`)
- URL fetcheada (truncada, clickable)
- Tamaño del contenido
- Status indicator (success/truncated/cached/error)
- Vista expandible con el contenido textual

---

## 4. Risk Matrix

| Riesgo | Severidad | Mitigacion | Estado |
|--------|----------|-----------|--------|
| SSRF a servicios internos | CRITICAL | URL schema check + hostname blocklist + DNS resolution + IP CIDR check | Implementar |
| DNS rebinding | HIGH | Resolver DNS una vez, usar IP directa en fetch con header Host | Implementar |
| Redirect a IPs privadas | HIGH | `redirect: "manual"` + revalidar cada hop | Implementar |
| Descarga de contenido masivo | MEDIUM | Content-Length check pre-fetch + stream read con byte limit | Implementar |
| XSS via HTML en output | MEDIUM | HTML→text conversion + iframe sandbox para preview UI | Implementar |
| Prompt injection via fetched content | MEDIUM | Output text truncation, secret filtering, limitar al LLM | Implementar |
| Rate limit evasion | LOW | Rate limiter per-host con sliding window | Implementar |
| Cache poisoning | LOW | Cache solo contenido validado + immutabilidad del cache entry | Implementar |
| Credential leak via URL params | LOW | No pasa nada especial — el LLM no deberia tener creds. Si las tiene, el bash output filter ya las cubre | N/A |
| User-Agent fingerprinting | LOW | UA string fija e identificable como bot | Implementar |

---

## 5. Dependencies

### Core (elegidas para la implementacion)

```bash
bun add @mozilla/readability linkedom turndown
```

| Dependencia | Peso | Proposito | Alternativa rechazada |
|------------|------|-----------|----------------------|
| `@mozilla/readability` | ~15KB | Extrae contenido principal (algoritmo Firefox Reader Mode) | regex naive (60% calidad) |
| `linkedom` | ~100KB | DOM parser ligero para node/Bun (necesario por readability) | `jsdom` (~10MB, demasiado pesado) |
| `turndown` | ~20KB | HTML → Markdown estructurado (headings, links, code blocks, tablas) | regex manual (pierde estructura) |

**Total: ~135KB** en `node_modules`. Zero binarios, zero nativos. Bun los instala en < 1 segundo.

### Por que no:

- **Puppeteer/Playwright**: Requieren Chromium (~300MB). Overkill. Solo el ~5% de paginas necesitan JS rendering.
- **jsdom**: ~10MB para un DOM parser cuando `linkedom` hace lo mismo en 100KB.
- **Cheerio**: Buen parser pero no compatible con `@mozilla/readability` (necesita DOM API completa).

### Fallback chain

Si `readability` no puede extraer (pagina sin contenido semantico, SPA vacia, etc.), se usa el regex HTML→text del plan original como fallback automatico. El agente nunca ve un error — ve el mejor resultado disponible.

```typescript
function extractContent(html: string, url: string): ExtractedContent {
  try {
    const doc = parseHTML(html, url);              // linkedom
    const article = new Readability(doc).parse();  // readability
    if (article) {
      return {
        title: article.title,
        markdown: turndownService.turndown(article.content),
        textContent: article.textContent,
        excerpt: article.excerpt,
        siteName: article.siteName,
      };
    }
  } catch {}
  
  // Fallback: regex extraction from plan original
  return {
    title: extractTitleRegex(html),
    markdown: "",
    textContent: htmlToText(html),
    excerpt: "",
    siteName: "",
  };
}

---

## 6. Implementation Phases

### Phase 1: Core Security + Fetch (MVP)
- [ ] 1.1 Create `apps/server/src/core/tools/web-fetch/` directory
- [ ] 1.2 Implement `security.ts` — URL validation, SSRF blocklist, DNS resolution, IP CIDR check, redirect tracker
- [ ] 1.3 Implement `web-fetch-tool.ts` — tool definition with safeFetch wrapper
- [ ] 1.4 Install deps: `bun add @mozilla/readability linkedom turndown`
- [ ] 1.5 Implement `extractor.ts` — readability + turndown pipeline con fallback a regex
- [ ] 1.6 Register in `tool-factory.ts` as `web_fetch`
- [ ] 1.7 Add to `AVAILABLE_TOOLS` in `schemas.ts`
- [ ] 1.8 Verify: basic fetch of a public URL returns clean Markdown
- [ ] 1.9 Unit test: SSRF blocklist (localhost, private IPs, metadata endpoints)
- [ ] 1.10 Unit test: redirect validation (each hop rechecked)
- [ ] 1.11 Unit test: readability extraction on blog/doc/API pages
- [ ] 1.12 Unit test: fallback to regex when readability fails

### Phase 2: Performance
- [ ] 2.1 Implement `cache.ts` — in-memory cache with TTL, ETag, LRU eviction
- [ ] 2.2 Implement `rate-limiter.ts` — per-host sliding window
- [ ] 2.3 Implement stream read with byte limit (10MB cap, abort mid-stream)
- [ ] 2.4 Implement conditional fetch (If-None-Match / If-Modified-Since)
- [ ] 2.5 Unit test: cache hit/miss/stale, rate limit enforcement

### Phase 3: Quality + Frontend
- [ ] 3.1 Improve `extractor.ts` — content-type dispatch (JSON → format, XML → format, plain text passthrough)
- [ ] 3.2 Create `WebFetchResult.tsx` — compact card with title, URL, content size, status badge, expandable markdown preview
- [ ] 3.3 Add `web_fetch` to `TOOL_META` in `ToolCallRow.tsx`
- [ ] 3.4 E2E test: agent uses web_fetch, receives clean markdown, processes it
- [ ] 3.5 E2E test: SSRF attack attempts are blocked
- [ ] 3.6 E2E test: readability extracts only article from cluttered page (navs, ads, footers stripped)
- [ ] 3.7 E2E test: fallback path works when readability fails
- [ ] 3.8 Verify `bun run build` passes
