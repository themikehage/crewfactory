import { RichMarkdown } from "../../RichMarkdown";

interface MarkdownProps {
  content: string;
  title?: string;
}

export function MarkdownComponent({ content, title }: MarkdownProps) {
  return (
    <div className="flex flex-col gap-2 w-full">
      {title && (
        <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase mb-1">
          {title}
        </h3>
      )}
      <div className="bg-card text-card-foreground border border-border rounded-lg p-4 shadow-sm w-full leading-relaxed prose prose-invert max-w-none">
        <RichMarkdown content={content} />
      </div>
    </div>
  );
}
