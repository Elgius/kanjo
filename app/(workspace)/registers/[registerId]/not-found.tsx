import Link from "next/link";

import { PageContainer, Surface } from "@/components/pos/primitives";

export default function RegisterNotFound() {
  return (
    <PageContainer>
      <Surface className="flex min-h-[480px] items-center justify-center p-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-4">
          <h1 className="font-serif text-3xl font-semibold">Register not found</h1>
          <p className="text-xs leading-5 text-muted-foreground">
            This register may have been removed or is no longer active.
          </p>
          <Link
            href="/registers"
            className="flex h-10 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground"
          >
            Back to registers
          </Link>
        </div>
      </Surface>
    </PageContainer>
  );
}
