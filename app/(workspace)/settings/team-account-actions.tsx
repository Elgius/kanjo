"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";

import { cn } from "@/lib/utils";
import {
  deleteAccountAction,
  resetAccountPasswordAction,
  setSiteAdminAction,
  updateUsernameAction,
} from "./actions";

const triggerClass =
  "h-9 rounded-lg border border-border px-3 text-[11px] font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const fieldClass =
  "h-10 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";
const backdropClass =
  "fixed inset-0 z-50 min-h-dvh bg-black/35 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0";
const popupClass =
  "fixed left-1/2 top-1/2 z-50 w-[min(430px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-5 text-foreground shadow-2xl transition-[scale,opacity] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0";
const cancelClass =
  "h-10 rounded-lg border border-border px-4 text-xs font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type ServerFormAction = (formData: FormData) => void | Promise<void>;

function DialogFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <AlertDialog.Portal>
      <AlertDialog.Backdrop className={backdropClass} />
      <AlertDialog.Popup className={popupClass}>
        <AlertDialog.Title className="font-serif text-xl font-semibold">{title}</AlertDialog.Title>
        <AlertDialog.Description className="mt-1.5 text-xs leading-5 text-muted-foreground">
          {description}
        </AlertDialog.Description>
        {children}
      </AlertDialog.Popup>
    </AlertDialog.Portal>
  );
}

function ConfirmationDialog({
  action,
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  hiddenFields = [],
}: {
  action: ServerFormAction;
  trigger: string;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  hiddenFields?: Array<{ name: string; value: string }>;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger
        type="button"
        className={cn(triggerClass, destructive && "border-destructive/30 text-destructive hover:bg-destructive/10")}
      >
        {trigger}
      </AlertDialog.Trigger>
      <DialogFrame title={title} description={description}>
        <form action={action} className="mt-5 flex justify-end gap-2.5">
          {hiddenFields.map((field) => (
            <input key={field.name} type="hidden" name={field.name} value={field.value} />
          ))}
          <AlertDialog.Close type="button" className={cancelClass}>Cancel</AlertDialog.Close>
          <button
            type="submit"
            className={cn(
              "h-10 rounded-lg px-4 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {confirmLabel}
          </button>
        </form>
      </DialogFrame>
    </AlertDialog.Root>
  );
}

function EditUsernameDialog({ userId, username, label }: { userId: string; username: string | null; label: string }) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger type="button" className={triggerClass}>Edit username</AlertDialog.Trigger>
      <DialogFrame
        title="Change username?"
        description={`This changes the sign-in username for ${label}. Confirm the new username to proceed.`}
      >
        <form action={updateUsernameAction.bind(null, userId)} className="mt-5 grid gap-4">
          <label className="grid gap-1.5 text-xs font-semibold">
            New username
            <input
              name="username"
              defaultValue={username ?? ""}
              autoComplete="off"
              minLength={3}
              maxLength={30}
              pattern="[A-Za-z0-9_.]+"
              required
              className={fieldClass}
            />
          </label>
          <div className="flex justify-end gap-2.5">
            <AlertDialog.Close type="button" className={cancelClass}>Cancel</AlertDialog.Close>
            <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              Confirm change
            </button>
          </div>
        </form>
      </DialogFrame>
    </AlertDialog.Root>
  );
}

function ResetPasswordDialog({ userId, label }: { userId: string; label: string }) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger type="button" className={triggerClass}>Reset password</AlertDialog.Trigger>
      <DialogFrame
        title="Reset password?"
        description={`Set a new password for ${label}. Confirming will also sign this account out of every active session.`}
      >
        <form action={resetAccountPasswordAction.bind(null, userId)} className="mt-5 grid gap-4">
          <label className="grid gap-1.5 text-xs font-semibold">
            New password
            <input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold">
            Confirm new password
            <input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} required className={fieldClass} />
          </label>
          <div className="flex justify-end gap-2.5">
            <AlertDialog.Close type="button" className={cancelClass}>Cancel</AlertDialog.Close>
            <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              Confirm reset
            </button>
          </div>
        </form>
      </DialogFrame>
    </AlertDialog.Root>
  );
}

export function TeamAccountActions({
  account,
  currentUserId,
}: {
  account: { id: string; username: string | null; email: string; isSiteAdmin: boolean };
  currentUserId: string;
}) {
  const label = account.username ? `@${account.username}` : account.email;
  const isSelf = account.id === currentUserId;
  const canEditCredentials = !account.isSiteAdmin || isSelf;
  const canDelete = !account.isSiteAdmin && !isSelf;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canEditCredentials ? (
        <>
          <EditUsernameDialog userId={account.id} username={account.username} label={label} />
          <ResetPasswordDialog userId={account.id} label={label} />
        </>
      ) : null}
      <ConfirmationDialog
        action={setSiteAdminAction.bind(null, account.id)}
        trigger={account.isSiteAdmin ? "Demote" : "Promote"}
        title={`${account.isSiteAdmin ? "Demote" : "Promote"} ${label}?`}
        description={account.isSiteAdmin
          ? "This account will lose site administrator access. Their assigned role will determine what they can access."
          : "This account will gain unrestricted site administrator access, including team and role management."}
        confirmLabel={`Confirm ${account.isSiteAdmin ? "demotion" : "promotion"}`}
        destructive={account.isSiteAdmin}
        hiddenFields={[{ name: "isSiteAdmin", value: account.isSiteAdmin ? "false" : "true" }]}
      />
      {canDelete ? (
        <ConfirmationDialog
          action={deleteAccountAction.bind(null, account.id)}
          trigger="Delete"
          title={`Delete ${label}?`}
          description="This permanently removes sign-in access and all active sessions. Historical sales and audit references remain intact. This action cannot be undone."
          confirmLabel="Delete account"
          destructive
        />
      ) : null}
      {account.isSiteAdmin && !isSelf ? (
        <span className="w-full text-right text-[10px] text-muted-foreground">
          Demote this admin before managing their credentials.
        </span>
      ) : null}
    </div>
  );
}
