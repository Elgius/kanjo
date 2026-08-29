"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, BotMessageSquare, Plus, Sparkles } from "lucide-react";

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  content: string;
};

const starterPrompts = [
  "Give me today’s operating brief",
  "Where should I focus first?",
  "Flag potential stock risks",
];

export function AiCooChat({ firstName }: { firstName: string }) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  function sendMessage(content: string) {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;

    setMessages((current) => {
      const messageId = current.length;
      return [
        ...current,
        { id: messageId, role: "user", content: trimmedContent },
        {
          id: messageId + 1,
          role: "assistant",
          content:
            "I’ve got it. This chat is ready to be connected to your AI service for live answers using Kanjo’s operational data.",
        },
      ];
    });
    setDraft("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(draft);
    }
  }

  return (
    <div className="flex h-[calc(100svh-3.5rem)] min-h-[560px] flex-col md:h-svh">
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border pl-[68px] pr-5 sm:pr-8 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BotMessageSquare className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">AI COO</h1>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-chart-1" aria-hidden="true" />
              Your operations partner
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMessages([])}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">New chat</span>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
        <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
              <span className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-border bg-card text-chart-1">
                <Sparkles className="size-6" aria-hidden="true" />
              </span>
              <p className="mb-2 font-mono text-[10px] tracking-[0.12em] text-muted-foreground">
                KANJO INTELLIGENCE
              </p>
              <h2 className="max-w-lg font-serif text-3xl font-semibold leading-tight tracking-[-0.025em] sm:text-4xl">
                Good morning, {firstName}. What should we work on?
              </h2>
              <p className="mt-3 max-w-md text-[13px] leading-5 text-muted-foreground">
                Ask about sales, stock, registers, customers, or the decisions that need your attention.
              </p>
              <div className="mt-8 grid w-full max-w-[640px] gap-2 sm:grid-cols-3">
                {starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    className="flex min-h-[68px] items-center justify-center rounded-xl border border-border bg-card px-4 py-3 text-center text-xs font-medium leading-5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col justify-end gap-6 py-8" aria-live="polite">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-[13px] leading-5 text-primary-foreground"
                      : "flex max-w-[88%] items-start gap-3"
                  }
                >
                  {message.role === "assistant" ? (
                    <>
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-chart-1">
                        <Sparkles className="size-3.5" aria-hidden="true" />
                      </span>
                      <div className="rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3 text-[13px] leading-5">
                        {message.content}
                      </div>
                    </>
                  ) : (
                    message.content
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className="shrink-0 px-4 pb-5 pt-3 sm:px-6 sm:pb-7">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-[760px] items-end gap-3 rounded-2xl border border-border bg-card p-2.5 pl-4 shadow-[0_8px_30px_rgba(46,46,46,0.06)] focus-within:ring-2 focus-within:ring-ring"
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            aria-label="Message AI COO"
            placeholder="Ask AI COO anything about your business…"
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-[13px] leading-5 outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send message"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </button>
        </form>
        <p className="mx-auto mt-2.5 max-w-[760px] text-center text-[10px] text-muted-foreground">
          AI COO can make mistakes. Review important business decisions.
        </p>
      </footer>
    </div>
  );
}
