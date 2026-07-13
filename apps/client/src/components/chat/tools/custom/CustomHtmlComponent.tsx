import { HtmlPreview } from "../../HtmlPreview";

interface CustomHtmlProps {
  html: string;
  title?: string;
  height?: string;
  tokens: string;
}

export function CustomHtmlComponent({ html, title, height, tokens }: CustomHtmlProps) {
  // Inject theme design tokens inside the head tag
  const cssStyles = `<style>${tokens}</style>`;
  
  let processedHtml = html;
  if (html.includes("</head>") || html.includes("</HEAD>")) {
    processedHtml = html.replace(/(<\/head\s*>)/i, `${cssStyles}$1`);
  } else if (html.includes("<html") || html.includes("<HTML")) {
    processedHtml = html.replace(/(<html[^>]*>)/i, `$1<head>${cssStyles}</head>`);
  } else {
    processedHtml = `${cssStyles}${html}`;
  }

  return (
    <div className="w-full" style={{ height: height || "70vh" }}>
      <HtmlPreview html={processedHtml} title={title} fullBleed />
    </div>
  );
}
