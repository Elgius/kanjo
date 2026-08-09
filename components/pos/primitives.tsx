import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1208px] flex-col gap-6 px-4 py-7 sm:px-6 lg:px-10 lg:py-9",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-muted-foreground">{eyebrow}</p>
        <h1 className="font-serif text-[32px] font-semibold leading-[38px] tracking-[-0.025em] sm:text-4xl sm:leading-[42px]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-[13px] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2.5">{actions}</div> : null}
    </header>
  );
}

export function Surface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-border bg-card", className)}>
      {children}
    </section>
  );
}

export function Action({
  children,
  variant = "primary",
  className,
  type = "button",
}: {
  children: ReactNode;
  variant?: "primary" | "outline";
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-lg px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        variant === "primary"
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border border-border bg-card text-foreground hover:bg-accent",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function MetricCard({
  label,
  value,
  note,
  dark = false,
  accent = false,
  notePosition = "stack",
  className,
}: {
  label: string;
  value: string;
  note?: string;
  dark?: boolean;
  accent?: boolean;
  notePosition?: "inline" | "stack";
  className?: string;
}) {
  const inlineNote = dark || notePosition === "inline";

  return (
    <Surface
      className={cn(
        "flex min-h-[108px] flex-col justify-between p-5",
        dark && "border-primary bg-primary text-primary-foreground",
        className,
      )}
    >
      <p
        className={cn(
          "text-[11px] text-muted-foreground",
          dark && "text-[#CFC8B8]",
        )}
      >
        {label}
      </p>
      <div
        className={cn(
          "flex gap-1.5",
          inlineNote ? "items-end justify-between" : "flex-col items-start",
        )}
      >
        <p
          className={cn(
            "text-[27px] font-semibold leading-8",
            dark && "font-serif",
            accent && "text-chart-1",
          )}
        >
          {value}
        </p>
        {note ? (
          <p
            className={cn(
              "text-[11px] text-muted-foreground",
              dark && "text-chart-1",
            )}
          >
            {note}
          </p>
        ) : null}
      </div>
    </Surface>
  );
}
