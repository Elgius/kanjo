"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email"));
    const password = String(formData.get("password"));
    const rememberMe = formData.get("rememberMe") === "on";

    try {
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
        rememberMe,
      });

      if (signInError) {
        setError(signInError.message || "Unable to sign in. Check your credentials.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Unable to reach the authentication service. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-[440px] flex-col gap-7"
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 lg:hidden">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary font-serif text-lg font-bold text-primary-foreground">
            K
          </span>
          <span className="text-sm font-bold">Kanjo</span>
        </div>
        <h2 className="font-serif text-[40px] font-semibold leading-[46px] tracking-[-0.025em]">
          Welcome back
        </h2>
        <p className="text-[15px] leading-[22px] text-muted-foreground">
          Enter your credentials to open today&apos;s workspace.
        </p>
      </div>

      <label className="flex flex-col gap-2 text-[13px] font-semibold">
        Email address
        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@kanjo.mv"
          required
          disabled={isPending}
          className="h-12 rounded-lg border border-input bg-card px-3.5 text-sm font-normal outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      <label className="flex flex-col gap-2 text-[13px] font-semibold">
        Password
        <span className="flex h-12 items-center rounded-lg border border-input bg-card pr-3.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/15">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            required
            disabled={isPending}
            className="min-w-0 flex-1 bg-transparent px-3.5 font-mono text-sm outline-none disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </span>
      </label>

      <div className="flex items-center justify-between gap-4">
        <label className="flex items-center gap-2.5 text-[13px]">
          <input
            type="checkbox"
            name="rememberMe"
            defaultChecked
            disabled={isPending}
            className="size-[18px] accent-primary"
          />
          Keep me signed in
        </label>
        <span className="font-mono text-[11px] text-muted-foreground">
          SECURE SESSION
        </span>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-[13px] text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3.5">
        <button
          type="submit"
          disabled={isPending}
          className="flex h-[50px] items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-65"
        >
          {isPending ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            "Sign in to Kanjo"
          )}
        </button>
        <p className="text-center text-xs leading-[18px] text-muted-foreground">
          Need access? Contact your store administrator.
        </p>
      </div>
    </form>
  );
}
