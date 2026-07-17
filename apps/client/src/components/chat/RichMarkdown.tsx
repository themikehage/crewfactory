import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface Props {
  content: string;
}

function replaceWorkspacePathsWithLinks(text: string): string {
  if (typeof text !== "string") return text;

  // Match absolute workspace paths on windows or unix format
  const winRegex = /[a-zA-Z]:\\tmp\\pi-web-users\\[a-zA-Z0-9_-]+\\workspace\\([a-zA-Z0-9_./\\-~%@$#+!]+)/gi;
  const nixRegex = /(?:[a-zA-Z]:)?\/tmp\/pi-web-users\/[a-zA-Z0-9_-]+\/workspace\/([a-zA-Z0-9_./\\-~%@$#+!]+)/gi;

  let result = text.replace(winRegex, (_, relPath) => {
    const cleaned = relPath.replace(/\\/g, "/");
    return `[${cleaned}](workspace-file://${cleaned})`;
  });

  result = result.replace(nixRegex, (_, relPath) => {
    const cleaned = relPath.replace(/\\/g, "/");
    return `[${cleaned}](workspace-file://${cleaned})`;
  });

  return result;
}

function customUrlTransform(url: string): string {
  if (url.startsWith("workspace-file://")) {
    return url;
  }
  const safeProtocol = /^(https?|mailto|tel):/i;
  if (safeProtocol.test(url)) return url;
  return "#";
}

export function RichMarkdown({ content }: Props) {
  const processedContent = useMemo(() => replaceWorkspacePathsWithLinks(content), [content]);

  return (
    <div className="prose prose-invert max-w-none text-base md:text-sm leading-relaxed font-sans break-word">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={customUrlTransform}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const inline = !match;
            const codeString = String(children).replace(/\n$/, "");

            if (inline) {
              return (
                <code
                  className="bg-card-hover/80 text-primary font-mono px-1.5 py-0.5 rounded text-xs"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            const isTree = !match && /[├└│].*─{2,}/.test(codeString);

            if (isTree) {
              return (
                <div className="my-3 rounded-lg overflow-x-auto border border-input shadow-md font-mono text-xs">
                  <div className="bg-card px-3 py-1.5 border-b border-input text-xs text-muted-foreground flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                    </svg>
                    <span>File Tree</span>
                  </div>
                  <pre className="m-0 p-3 bg-muted whitespace-pre-wrap break-words">{codeString}</pre>
                </div>
              );
            }

            return (
              <div className="my-3 rounded-lg overflow-x-auto border border-input shadow-md font-mono text-xs">
                <div className="bg-card px-3 py-1.5 border-b border-input text-xs text-muted-foreground flex justify-between items-center">
                  <span>{match ? match[1] : "code"}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(codeString)}
                    className="hover:text-foreground transition-colors text-xs"
                  >
                    Copy
                  </button>
                </div>
                <SyntaxHighlighter
                  style={vscDarkPlus as any}
                  language={match ? match[1] : "text"}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    background: "var(--code-bg)",
                    padding: "0.75rem",
                    overflowX: "auto",
                  }}
                >
                  {codeString}
                </SyntaxHighlighter>
              </div>
            );
          },
          p({ children }) {
            return <p className="mb-2 last:mb-0 break-words">{children}</p>;
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>;
          },
          li({ children }) {
            return <li className="break-words">{children}</li>;
          },
          h1({ children }) {
            return <h1 className="text-base font-bold text-foreground mt-4 mb-2">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-sm font-bold text-foreground mt-3 mb-2">{children}</h2>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground/80 italic">
                {children}
              </blockquote>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3 rounded-lg border border-input shadow-sm">
                <table className="min-w-full border-collapse text-xs">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-card-hover/60">{children}</thead>;
          },
          th({ children }) {
            return (
              <th className="px-3 py-2 text-left font-semibold text-foreground border-b border-input whitespace-nowrap">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="px-3 py-1.5 text-muted-foreground border-b border-input/40">
                {children}
              </td>
            );
          },
          tr({ children }) {
            return <tr className="hover:bg-card-hover/20 transition-colors">{children}</tr>;
          },
          a({ href, children, ...props }) {
            if (href?.startsWith("workspace-file://")) {
              const relPath = href.substring("workspace-file://".length);
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.dispatchEvent(
                      new CustomEvent("openWorkspaceFile", { detail: { path: relPath } })
                    );
                  }}
                  className="text-primary hover:underline font-mono bg-primary/5 hover:bg-primary/10 px-1.5 py-0.5 rounded transition-all inline cursor-pointer text-xs"
                >
                  {children}
                </button>
              );
            }
            return (
              <a href={href} className="text-primary hover:underline" {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
