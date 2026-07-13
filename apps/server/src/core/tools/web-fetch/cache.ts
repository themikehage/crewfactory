export interface CacheEntry {
  url: string;
  title: string;
  markdown: string;
  textContent: string;
  contentType: string;
  excerpt: string;
  siteName: string;
  extractionMethod: "readability" | "regex-fallback";
  fetchedAt: number;
  etag?: string;
  lastModified?: string;
  originalSize: number;
  extractedSize: number;
}

export class WebFetchCache {
  private memory = new Map<string, CacheEntry>();
  private order: string[] = []; // for LRU tracking
  private maxEntries: number;
  private ttlMs: number;

  constructor(maxEntries = 200, ttlMs = 5 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  get(url: string): CacheEntry | null {
    const entry = this.memory.get(url);
    if (!entry) return null;

    const age = Date.now() - entry.fetchedAt;
    if (age > this.ttlMs) {
      this.invalidate(url);
      return null;
    }

    // Refresh LRU order
    this.order = this.order.filter(u => u !== url);
    this.order.push(url);

    return entry;
  }

  set(url: string, entry: CacheEntry): void {
    if (this.memory.has(url)) {
      this.order = this.order.filter(u => u !== url);
    }
    
    this.memory.set(url, entry);
    this.order.push(url);

    this.prune();
  }

  invalidate(url: string): void {
    this.memory.delete(url);
    this.order = this.order.filter(u => u !== url);
  }

  private prune(): void {
    while (this.order.length > this.maxEntries) {
      const oldestUrl = this.order.shift();
      if (oldestUrl) {
        this.memory.delete(oldestUrl);
      }
    }
  }

  clear(): void {
    this.memory.clear();
    this.order = [];
  }
}

export const webFetchCache = new WebFetchCache();
