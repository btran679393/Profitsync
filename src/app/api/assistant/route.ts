import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/billing/server";
import {
  ASSISTANT_DAILY_LIMIT,
  ASSISTANT_MAX_SUMMARY,
  cleanHistory,
  cleanQuestion,
  usageDay,
  type AssistantStatus,
  type AssistantSummary,
} from "@/lib/assistant";
import { askClaude, assistantConfigured, questionsUsed, recordTokens, returnQuestion, takeQuestion } from "@/lib/assistantServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "private, no-store" };
const OFF: AssistantStatus = { available: false, allowed: false, remaining: 0, limit: ASSISTANT_DAILY_LIMIT };

async function signedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return error ? null : user;
}

// GET: whether the assistant is on, included in the seller's plan, and how
// many questions are left today.
export async function GET() {
  const user = await signedInUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!assistantConfigured() || !process.env.DATABASE_URL) return NextResponse.json(OFF, { headers: NO_STORE });

  const pool = getPool();
  try {
    const used = await questionsUsed(pool, user.id, usageDay());
    if (used === null) return NextResponse.json(OFF, { headers: NO_STORE });
    const { limits } = await getUserPlan(pool, user.id);
    const status: AssistantStatus = {
      available: true,
      allowed: limits.assistant,
      remaining: Math.max(0, ASSISTANT_DAILY_LIMIT - used),
      limit: ASSISTANT_DAILY_LIMIT,
    };
    return NextResponse.json(status, { headers: NO_STORE });
  } catch (error) {
    console.error("Loading assistant status failed:", error);
    return NextResponse.json(OFF, { headers: NO_STORE });
  }
}

// POST { question, history, summary }: one answer.
export async function POST(request: Request) {
  const user = await signedInUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!assistantConfigured() || !process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Ask ProfitSync isn't available right now." }, { status: 503 });
  }

  const raw = await request.text();
  if (raw.length > ASSISTANT_MAX_SUMMARY + 20_000) return NextResponse.json({ error: "That's too much to send at once." }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const question = cleanQuestion(body.question);
  if (!question) return NextResponse.json({ error: "Type a question first (up to 500 characters)." }, { status: 400 });
  const history = cleanHistory(body.history);
  const summary = body.summary as AssistantSummary | undefined;
  if (!summary || typeof summary !== "object" || JSON.stringify(summary).length > ASSISTANT_MAX_SUMMARY) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const pool = getPool();
  const day = usageDay();
  try {
    const { limits } = await getUserPlan(pool, user.id);
    if (!limits.assistant) {
      return NextResponse.json({ error: "Ask ProfitSync is part of the Ultimate plan.", upgrade: true }, { status: 402 });
    }
    const remaining = await takeQuestion(pool, user.id, day);
    if (remaining === null) {
      return NextResponse.json(
        { error: `You've asked ${ASSISTANT_DAILY_LIMIT} questions today. You can ask more tomorrow.`, remaining: 0 },
        { status: 429 }
      );
    }

    const answer = await askClaude(summary, history, question);
    if (!answer.ok) {
      await returnQuestion(pool, user.id, day);
      const message =
        answer.reason === "refused"
          ? "Sorry, I can't help with that one. Try asking about your sales, fees, listings or profit."
          : answer.reason === "busy"
            ? "Ask ProfitSync is busy right now. Try again in a minute."
            : "Something went wrong getting an answer. Try again in a minute.";
      return NextResponse.json({ error: message, remaining: remaining + 1 }, { status: answer.reason === "refused" ? 422 : 503 });
    }

    await recordTokens(pool, user.id, day, answer.inputTokens, answer.outputTokens).catch((error) =>
      console.error("Saving assistant usage failed:", error)
    );
    return NextResponse.json({ answer: answer.text, remaining }, { headers: NO_STORE });
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") {
      return NextResponse.json({ error: "Ask ProfitSync isn't available right now." }, { status: 503 });
    }
    console.error("Assistant failed:", error);
    return NextResponse.json({ error: "Something went wrong getting an answer. Try again in a minute." }, { status: 500 });
  }
}
