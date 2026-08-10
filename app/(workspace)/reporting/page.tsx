import type { Metadata } from "next";
import Image from "next/image";

import { PageContainer } from "@/components/pos/primitives";
import { requirePageAccess } from "@/lib/authorization";

export const metadata: Metadata = {
  title: "Reporting · Kanjo",
};

export default async function ReportingPage() {
  await requirePageAccess("REPORTING");
  return (
    <PageContainer className="min-h-[calc(100svh-3.5rem)] items-center justify-center py-12 md:min-h-svh">
      <section className="flex flex-col items-center text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Reporting
        </p>
        <h1 className="mt-2 font-serif text-[40px] font-semibold leading-none tracking-[-0.035em] sm:text-5xl">
          Coming soon
        </h1>
        <Image
          src="/images/sleeping-cat.png"
          alt="Pixel art of a curled-up sleeping cat"
          width={449}
          height={387}
          preload
          className="mt-7 h-auto w-[280px] select-none [image-rendering:pixelated] sm:w-[320px]"
        />
      </section>
    </PageContainer>
  );
}
