import { Skeleton } from "@/components/ui/Skeleton";

export function ChatSkeleton() {
  return (
    <div className="h-full flex flex-col bg-bg" aria-label="Loading messages">
      <div className="px-4 py-2 bg-surface border-b border-border flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-3 w-44 rounded" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col justify-center">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3 sm:py-4 w-full space-y-5">
          <MessageBubbleSkeleton align="left" lines={3} wide />
          <MessageBubbleSkeleton align="right" lines={2} />
          <MessageBubbleSkeleton align="left" lines={4} wide />
          <MessageBubbleSkeleton align="right" lines={1} />
          <MessageBubbleSkeleton align="left" lines={2} />
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <div className="max-w-3xl mx-auto">
          <Skeleton className="h-12 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function MessageBubbleSkeleton({
  align,
  lines,
  wide,
}: {
  align: "left" | "right";
  lines: number;
  wide?: boolean;
}) {
  return (
    <div className={`flex ${align === "right" ? "justify-end" : "justify-start"}`}>
      <div className={`space-y-2 ${wide ? "max-w-[75%]" : "max-w-[55%]"}`}>
        {Array.from({ length: lines }).map((_, i) => {
          const isLast = i === lines - 1;
          return (
            <Skeleton
              key={i}
              className={`h-3 rounded ${
                align === "right"
                  ? isLast ? "w-3/5 ml-auto" : "w-full"
                  : isLast ? "w-4/5" : "w-full"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
