import { sessionManager } from "./session-manager";

export interface ExaSearchOptions {
  username: string;
}

export interface ExaSearchArgs {
  query: string;
  type?: string;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  category?: string;
  startPublishedDate?: string;
  endPublishedDate?: string;
  maxAgeHours?: number;
  contentMode?: "highlights" | "text" | "summary";
  textMaxCharacters?: number;
}

export interface ExaResult {
  title?: string;
  url: string;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
  summary?: string;
}

export interface ExaSearchResponse {
  results: ExaResult[];
  searchType?: string;
  requestId?: string;
  costDollars?: number;
  output?: {
    content: string;
    grounding?: unknown;
  };
}

export function createExaSearchTool(opts: ExaSearchOptions) {
  return {
    name: "exa_search",
    description: `Search the web using Exa AI (semantic search engine). Returns query-relevant excerpts (highlights) with source URLs. Use this for documentation lookup, API references, debugging research, and current-awareness queries. Requires EXA_API_KEY to be configured in Settings > Env Vars.`,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language search query. Supports long, semantically rich descriptions.",
        },
        type: {
          type: "string",
          enum: ["auto", "fast", "instant", "deep-lite", "deep", "deep-reasoning"],
          description: "Search method. auto=balanced, fast/instant=low-latency, deep-lite/deep/deep-reasoning=synthesized multi-step.",
          default: "auto",
        },
        numResults: {
          type: "integer",
          description: "Number of results (1-25).",
          default: 10,
          minimum: 1,
          maximum: 25,
        },
        includeDomains: {
          type: "array",
          items: { type: "string" },
          description: 'Only return results from these domains (e.g. ["arxiv.org", "github.com"]).',
        },
        excludeDomains: {
          type: "array",
          items: { type: "string" },
          description: 'Exclude results from these domains (e.g. ["pinterest.com"]).',
        },
        category: {
          type: "string",
          enum: ["company", "people", "research paper", "news", "personal site", "financial report"],
          description: "Focus on specific content type.",
        },
        startPublishedDate: {
          type: "string",
          description: 'ISO 8601 date. Only return results published after this date (e.g. "2025-01-01").',
        },
        endPublishedDate: {
          type: "string",
          description: "ISO 8601 date. Only return results published before this date.",
        },
        maxAgeHours: {
          type: "integer",
          description: "Max age of cached content in hours. 0=always livecrawl, -1=never livecrawl. Omit for balanced default.",
          minimum: -1,
        },
        contentMode: {
          type: "string",
          enum: ["highlights", "text", "summary"],
          description: "Content extraction mode. highlights=token-efficient excerpts, text=full page text, summary=LLM summary.",
          default: "highlights",
        },
        textMaxCharacters: {
          type: "integer",
          description: "Max characters for text content mode. Only used when contentMode is 'text'.",
          default: 10000,
        },
      },
      required: ["query"],
    },
    execute: async (toolCallId: string, rawArgs: any, parentSignal?: AbortSignal) => {
      const args = rawArgs as ExaSearchArgs;
      const apiKey = getExaApiKey(opts.username);
      if (!apiKey) {
        return {
          content: [{ type: "text", text: "EXA_API_KEY not configured. Go to Settings > Env Vars to add it." }],
          isError: true,
        };
      }

      // Build the request body
      const body: Record<string, unknown> = {
        query: args.query,
        type: args.type || "auto",
        numResults: Math.min(args.numResults || 10, 25),
      };

      // Content configuration
      const contentMode = args.contentMode || "highlights";
      const contents: Record<string, unknown> = {};
      if (contentMode === "highlights") {
        contents.highlights = true;
      } else if (contentMode === "text") {
        contents.text = { maxCharacters: args.textMaxCharacters || 10000 };
      } else if (contentMode === "summary") {
        contents.summary = true;
      }
      body.contents = contents;

      // Optional filters
      if (args.includeDomains?.length) body.includeDomains = args.includeDomains;
      if (args.excludeDomains?.length) body.excludeDomains = args.excludeDomains;
      if (args.category) body.category = args.category;
      if (args.startPublishedDate) body.startPublishedDate = args.startPublishedDate;
      if (args.endPublishedDate) body.endPublishedDate = args.endPublishedDate;
      if (args.maxAgeHours !== undefined) contents.maxAgeHours = args.maxAgeHours;

      try {
        const response = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify(body),
          signal: parentSignal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            content: [{ type: "text", text: `Exa API error (${response.status}): ${errorText}` }],
            isError: true,
          };
        }

        const data = (await response.json()) as ExaSearchResponse;

        if (!data.results || data.results.length === 0) {
          return {
            content: [{ type: "text", text: "No search results found." }],
            details: { totalResults: 0 },
          };
        }

        // Format results for agent consumption
        const resultLines = data.results
          .map((r: ExaResult, i: number) => {
            const lines = [`${i + 1}. ${r.title || "Untitled"}`];
            lines.push(`   URL: ${r.url}`);
            if (r.publishedDate) lines.push(`   Published: ${r.publishedDate}`);
            if (r.author) lines.push(`   Author: ${r.author}`);
            if (r.highlights?.length) {
              r.highlights.forEach((h: string) => lines.push(`   > ${h}`));
            }
            if (r.text) {
              lines.push(`   ${r.text.substring(0, 500)}...`);
            }
            if (r.summary) {
              lines.push(`   Summary: ${r.summary}`);
            }
            return lines.join("\n");
          })
          .join("\n\n");

        const details: Record<string, unknown> = {
          totalResults: data.results.length,
          searchType: data.searchType || args.type || "auto",
          requestId: data.requestId,
          results: data.results.map((r: ExaResult) => ({
            title: r.title,
            url: r.url,
            publishedDate: r.publishedDate,
          })),
        };

        if (data.costDollars) {
          details.costDollars = data.costDollars;
        }

        if (data.output) {
          details.synthesizedOutput = data.output.content;
          details.grounding = data.output.grounding;
        }

        return {
          content: [{ type: "text", text: resultLines }],
          details,
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Exa Search error: ${String(e)}` }],
          isError: true,
        };
      }
    },
  };
}

function getExaApiKey(username: string): string | null {
  try {
    const env = sessionManager.getUserEnv(username);
    if (env.EXA_API_KEY) return env.EXA_API_KEY;
  } catch {}
  return process.env.EXA_API_KEY || null;
}
