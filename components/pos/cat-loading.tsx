import Image from "next/image";

export function CatLoading({
  title = "Opening Kanjo",
  message = "Getting your workspace ready…",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-[100] grid min-h-dvh place-items-center overflow-hidden bg-background px-5 text-foreground"
    >
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-7 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary font-serif text-xl font-bold text-primary-foreground">
            K
          </span>
          <span className="text-sm font-bold tracking-[-0.01em]">Kanjo</span>
        </div>

        <div className="kanjo-cat-track" aria-hidden="true">
          <span className="kanjo-cat-ground" />
          <span className="kanjo-cat-runner">
            <span className="kanjo-cat-step">
              <Image
                src="/images/loading-cat-walk.png"
                alt=""
                width={1254}
                height={1254}
                preload
                sizes="112px"
                className="h-auto w-28 select-none [image-rendering:pixelated]"
              />
            </span>
          </span>
        </div>

        <h2 className="mt-5 font-serif text-3xl font-semibold tracking-[-0.025em]">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <span className="mt-5 flex gap-1.5" aria-hidden="true">
          <span className="kanjo-loading-pixel" />
          <span className="kanjo-loading-pixel [animation-delay:150ms]" />
          <span className="kanjo-loading-pixel [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  );
}
