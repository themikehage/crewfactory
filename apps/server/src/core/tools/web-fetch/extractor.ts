import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

export interface ExtractedContent {
  title: string;
  markdown: string;
  textContent: string;
  excerpt: string;
  siteName: string;
  extractionMethod: "readability" | "regex-fallback";
}

export function htmlToText(html: string): string {
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

export function extractTitleRegex(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match && match[1] ? match[1].trim() : "";
}

export function extractContent(html: string, url: string): ExtractedContent {
  try {
    const { document } = parseHTML(html);
    const reader = new Readability(document);
    const article = reader.parse();

    if (article && (article.content || article.textContent)) {
      const markdown = article.content ? turndownService.turndown(article.content) : article.textContent;
      return {
        title: article.title || extractTitleRegex(html) || "Untitled Page",
        markdown: markdown || "",
        textContent: article.textContent || htmlToText(html),
        excerpt: article.excerpt || "",
        siteName: article.siteName || "",
        extractionMethod: "readability",
      };
    }
  } catch (error) {
    // Fail silently, proceed to fallback
  }

  const title = extractTitleRegex(html) || "Untitled Page";
  const textContent = htmlToText(html);
  return {
    title,
    markdown: textContent,
    textContent,
    excerpt: "",
    siteName: "",
    extractionMethod: "regex-fallback",
  };
}
