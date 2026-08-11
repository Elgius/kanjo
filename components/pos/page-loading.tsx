import { PageContainer, Surface } from "@/components/pos/primitives";
import { Skeleton } from "@/components/ui/skeleton";

export function PageLoading({ showMetrics = true }: { showMetrics?: boolean }) {
  return (
    <PageContainer className="gap-[22px]">
      <span className="sr-only" role="status">Loading page</span>
      <header className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-64 max-w-full" />
        <Skeleton className="h-4 w-[420px] max-w-full" />
      </header>

      {showMetrics ? (
        <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[112px] rounded-xl" />
          ))}
        </section>
      ) : null}

      <Surface className="grid gap-4 p-5">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-11 w-full" />
        <div className="grid gap-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      </Surface>
    </PageContainer>
  );
}
