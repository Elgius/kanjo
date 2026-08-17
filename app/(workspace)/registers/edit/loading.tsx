import { PageContainer, Surface } from "@/components/pos/primitives";

export default function Loading() {
  return <PageContainer><div className="h-20 animate-pulse rounded-xl bg-muted" /><Surface className="min-h-[520px] animate-pulse"><span /></Surface></PageContainer>;
}
