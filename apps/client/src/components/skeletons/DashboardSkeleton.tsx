import { Skeleton } from "@/components/ui/Skeleton";

export function DashboardSkeleton() {
  return (
    <div className="h-full flex flex-col bg-bg overflow-y-auto pb-10 scrollbar-thin" aria-label="Loading dashboard">
      <div className="bg-linear-to-b from-primary/10 via-bg to-bg px-5 pt-6 pb-4 sm:pt-10 sm:pb-8 border-b border-input/5">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-full" />
              <Skeleton className="h-7 w-48 rounded-lg" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-7 w-32 rounded-full" />
              <Skeleton className="h-7 w-28 rounded-full" />
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-none">
            <Skeleton className="h-7 w-24 rounded-full shrink-0" />
            <Skeleton className="h-7 w-28 rounded-full shrink-0" />
            <Skeleton className="h-7 w-24 rounded-full shrink-0" />
            <Skeleton className="h-7 w-28 rounded-full shrink-0" />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 py-6 w-full space-y-9">
        <SectionSkeleton id="agents-sec">
          <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-none">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center w-[80px] shrink-0 gap-1.5">
                <Skeleton className="w-16 h-16 rounded-full" />
                <Skeleton className="h-3 w-14 rounded" />
                <Skeleton className="h-2 w-10 rounded" />
              </div>
            ))}
          </div>
        </SectionSkeleton>

        <SectionSkeleton id="sessions-sec">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center bg-surface/85 border border-input/10 rounded-xl overflow-hidden h-[58px]">
                <Skeleton className="w-[58px] h-full rounded-none shrink-0" />
                <div className="flex-1 px-2.5 py-1 space-y-1.5">
                  <Skeleton className="h-3 w-3/4 rounded" />
                  <Skeleton className="h-2 w-1/2 rounded" />
                  <Skeleton className="h-2 w-1/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        </SectionSkeleton>

        <SectionSkeleton id="projects-sec">
          <div className="flex overflow-x-auto gap-4 pb-3 -mx-5 px-5 scrollbar-none sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-[145px] shrink-0 bg-surface/40 border border-input/15 rounded-2xl p-3 sm:w-auto">
                <Skeleton className="w-full aspect-square rounded-xl" />
                <div className="mt-2.5 space-y-1.5">
                  <Skeleton className="h-3 w-4/5 rounded" />
                  <Skeleton className="h-2 w-3/5 rounded" />
                  <Skeleton className="h-2 w-2/5 rounded" />
                </div>
                <div className="flex gap-1.5 mt-3 pt-2 border-t border-input/5">
                  <Skeleton className="flex-1 h-7 rounded-lg" />
                  <Skeleton className="w-7 h-7 rounded-lg" />
                  <Skeleton className="w-7 h-7 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </SectionSkeleton>

        <SectionSkeleton id="teams-sec">
          <div className="flex overflow-x-auto gap-4 pb-3 -mx-5 px-5 scrollbar-none sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-[145px] shrink-0 bg-surface/40 border border-input/15 rounded-2xl p-3 sm:w-auto">
                <Skeleton className="w-full aspect-square rounded-xl" />
                <div className="mt-2.5 space-y-1.5">
                  <Skeleton className="h-3 w-3/4 rounded" />
                  <Skeleton className="h-2 w-full rounded" />
                  <Skeleton className="h-2 w-2/5 rounded" />
                </div>
                <Skeleton className="w-full h-7 mt-3 rounded-lg" />
              </div>
            ))}
          </div>
        </SectionSkeleton>
      </div>
    </div>
  );
}

function SectionSkeleton({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div id={id} className="space-y-3">
      <Skeleton className="h-5 w-36 rounded-lg" />
      {children}
    </div>
  );
}
