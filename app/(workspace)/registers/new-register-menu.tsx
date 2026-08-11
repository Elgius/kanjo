"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { createRegisterAction } from "./actions";

const fieldClass =
  "h-10 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";

export function NewRegisterMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    nameRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function closeAndRestoreFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="new-register-form"
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Add register
      </button>

      {open ? (
        <form
          id="new-register-form"
          role="dialog"
          aria-labelledby="new-register-title"
          action={createRegisterAction}
          className="absolute right-0 z-20 mt-2 grid w-[min(90vw,380px)] gap-3 rounded-xl border border-border bg-card p-5 shadow-xl"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="new-register-title" className="text-sm font-semibold">New register</h2>
            <button
              type="button"
              aria-label="Close new register form"
              title="Close"
              onClick={closeAndRestoreFocus}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">The register code is generated automatically.</p>
          <label className="grid gap-1.5 text-xs">
            Name
            <input ref={nameRef} name="name" placeholder="Counter 01" className={fieldClass} required />
          </label>
          <fieldset className="grid gap-2 text-xs">
            <legend>Purpose</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3"><input type="radio" name="purpose" value="SHOP" required /> Shop</label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3"><input type="radio" name="purpose" value="RESTAURANT" required /> Restaurant</label>
            </div>
          </fieldset>
          <button type="submit" className="h-10 rounded-lg bg-primary text-xs font-semibold text-primary-foreground">Save register</button>
        </form>
      ) : null}
    </div>
  );
}
