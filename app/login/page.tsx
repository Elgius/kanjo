import { headers } from "next/headers";
import Image from "next/image";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { auth } from "@/lib/auth";

export default async function LoginPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    redirect("/");
  }

  return (
    <main className="flex min-h-dvh bg-background text-foreground">
      <section className="hidden min-h-dvh w-[560px] shrink-0 flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg border border-[#E6E4D7] font-serif text-xl font-bold">
            K
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.01em]">
            Kanjo
          </span>
        </div>

        <div className="flex flex-col gap-6">
          <span className="h-1 w-12 rounded-full bg-chart-1" />
          <h1 className="max-w-[420px] font-serif text-5xl font-semibold leading-[52px] tracking-[-0.025em]">
            Run the floor.
            <br />
            Read the business.
          </h1>
          <p className="max-w-[380px] text-base leading-6 text-[#CFC8B8]">
            One calm workspace for sales, registers, stock, and the people who
            keep everything moving.
          </p>
          <Image
            src="/images/login-cat-basket-themed.png"
            alt="Pixel-art cat awake in a basket, wrapped in a blanket"
            width={1441}
            height={1058}
            preload
            className="mt-16 h-auto w-full max-w-[288px] select-none [image-rendering:pixelated]"
          />
        </div>

        <div className="flex items-center justify-between border-t border-[#5E5A52] pt-5 font-mono text-xs text-chart-4">
          <span>STORE 01 · MALÉ</span>
          <span>v2.4.0</span>
        </div>
      </section>

      <section className="flex min-h-dvh flex-1 items-center justify-center px-5 py-12 sm:px-12 lg:p-[72px]">
        <LoginForm />
      </section>
    </main>
  );
}
