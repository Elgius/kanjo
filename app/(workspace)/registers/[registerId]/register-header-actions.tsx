"use client";

import { useRef } from "react";

import { closeShiftAction } from "../actions";

export function RegisterHeaderActions({
  registerId,
  shiftId,
  expectedCashLaari,
  canEdit,
}: {
  registerId: string;
  shiftId: string;
  expectedCashLaari: number;
  canEdit: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeAction = closeShiftAction.bind(null, shiftId, registerId);

  return (
    <div className="flex gap-2.5">
      <button
        type="button"
        onClick={() => window.print()}
        className="h-10 rounded-lg border border-border bg-card px-4 text-xs font-semibold"
      >
        Print summary
      </button>
      {canEdit ? (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground"
        >
          Close shift
        </button>
      ) : null}

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(420px,calc(100%-32px))] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/35"
      >
        <form action={closeAction} className="flex flex-col gap-5 p-6">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">Shift reconciliation</p>
            <h2 className="font-serif text-2xl font-semibold">Close this shift?</h2>
            <p className="text-xs leading-5 text-muted-foreground">
              Enter the cash counted in the drawer. The shift closes immediately after confirmation.
            </p>
          </div>
          <label className="grid gap-1.5 text-[10px] tracking-[0.08em] text-muted-foreground">
            CLOSING CASH (MVR)
            <input
              name="closingCash"
              inputMode="decimal"
              defaultValue={(expectedCashLaari / 100).toFixed(2)}
              required
              className="h-11 rounded-lg border border-border bg-background px-3 font-mono text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/15"
            />
          </label>
          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="h-10 rounded-lg border border-border px-4 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground"
            >
              Close shift
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
