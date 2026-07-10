export type SupportedLocale = "en" | "es";

export type LiteralsRecord = Record<SupportedLocale, Record<string, string>>;

export interface LiteralsContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
}

export interface MessageUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
}

export interface ContextUsage {
  totalTokens: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  limit: number | null;
}
