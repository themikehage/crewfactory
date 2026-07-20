interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`bg-surface-hover/70 animate-pulse rounded-xl ${className}`}
      aria-hidden="true"
    />
  );
}
