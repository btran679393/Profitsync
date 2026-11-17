"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button, Drawer, Notice, Textarea } from "@/components/ui";
import { Icon } from "./dashboard/Icon";
import {
  ASSISTANT_MAX_QUESTION,
  SUGGESTED_QUESTIONS,
  type AssistantStatus,
  type AssistantSummary,
  type AssistantTurn,
} from "@/lib/assistant";

// "Ask ProfitSync": a side panel where the seller asks about their numbers
// in plain words. The page passes in a summary of what it's showing.
export default function AssistantPanel({
  open,
  onClose,
  status,
  getSummary,
  scopeLabel,
  onUpgrade,
  onRemainingChange,
}: {
  open: boolean;
  onClose: () => void;
  status: AssistantStatus;
  getSummary: () => AssistantSummary | null;
  // e.g. "Last 30 days · Demo Collectibles", so the seller knows what it's looking at.
  scopeLabel: string;
  onUpgrade: () => void;
  onRemainingChange: (remaining: number) => void;
}) {
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns, asking]);

  async function ask(text: string) {
    const question = text.replace(/\s+/g, " ").trim();
    if (!question || asking) return;
    const summary = getSummary();
    if (!summary) {
      setError("Your numbers are still loading. Try again in a moment.");
      return;
    }
    setError("");
    setAsking(true);
    setDraft("");
    const history = turns;
    setTurns([...history, { role: "user", text: question }]);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history, summary }),
      });
      const data = (await response.json().catch(() => ({}))) as { answer?: string; error?: string; remaining?: number };
      if (typeof data.remaining === "number") onRemainingChange(data.remaining);
      if (!response.ok || !data.answer) {
        // Take the question back off so it can be asked again.
        setTurns(history);
        setDraft(question);
        setError(data.error ?? "Something went wrong getting an answer. Try again in a minute.");
        return;
      }
      setTurns([...history, { role: "user", text: question }, { role: "assistant", text: data.answer }]);
    } catch {
      setTurns(history);
      setDraft(question);
      setError("Couldn't reach ProfitSync. Check your connection and try again.");
    } finally {
      setAsking(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void ask(draft);
    }
  }

  const outOfQuestions = status.allowed && status.remaining <= 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Icon name="sparkle" size={18} className="text-accent" />
          Ask ProfitSync
        </span>
      }
      description={`Answers from your numbers · ${scopeLabel}`}
      footer={
        status.allowed ? (
          <form onSubmit={submit} className="flex w-full flex-col gap-2">
            <Textarea
              data-autofocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              maxLength={ASSISTANT_MAX_QUESTION}
              placeholder={outOfQuestions ? "You can ask more tomorrow." : "Ask about your sales, fees, listings or profit…"}
              disabled={outOfQuestions}
              aria-label="Your question"
              className="min-h-16 resize-none"
              rows={2}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="ps-num text-xs text-subtle">
                {status.remaining} {status.remaining === 1 ? "question" : "questions"} left today
              </span>
              <div className="flex gap-2">
                {turns.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => { setTurns([]); setError(""); }} disabled={asking}>
                    New chat
                  </Button>
                )}
                <Button type="submit" variant="primary" size="sm" loading={asking} disabled={!draft.trim() || outOfQuestions}>
                  Ask
                </Button>
              </div>
            </div>
          </form>
        ) : null
      }
    >
      {!status.allowed ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Ask questions about your store in plain words, like &ldquo;Which listings should I lower the price on?&rdquo; or &ldquo;Why
            is my profit down this month?&rdquo;, and get an answer worked out from your own numbers.
          </p>
          <Notice tone="accent" title="Part of the Ultimate plan" action={<Button variant="primary" size="sm" onClick={onUpgrade}>See plans</Button>}>
            Upgrade to Ultimate to use Ask ProfitSync.
          </Notice>
        </div>
      ) : (
        <div className="space-y-4" aria-live="polite">
          {turns.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Ask anything about your sales, fees, listings or profit. Answers use the period and store you have chosen.
              </p>
              <div className="flex flex-col items-start gap-2">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void ask(question)}
                    disabled={asking || outOfQuestions}
                    className="rounded-full border border-line bg-surface-2/60 px-3 py-1.5 text-left text-sm text-ink-2 transition hover:border-line-strong hover:text-ink disabled:opacity-50"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn, index) =>
            turn.role === "user" ? (
              <div key={index} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-on-accent">{turn.text}</p>
              </div>
            ) : (
              <div key={index} className="max-w-[95%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink-2">
                {turn.text}
              </div>
            )
          )}

          {asking && (
            <div className="inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-sm text-muted">
              <Icon name="sparkle" size={14} className="animate-pulse text-accent" />
              Looking at your numbers…
            </div>
          )}

          {error && (
            <Notice tone="warn">{error}</Notice>
          )}

          {turns.length > 0 && (
            <p className="text-xs text-subtle">Answers are written by AI from your ProfitSync numbers. Double-check before big decisions.</p>
          )}
          <div ref={endRef} />
        </div>
      )}
    </Drawer>
  );
}
