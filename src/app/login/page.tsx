
"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function socialSignIn(provider: "google" | "azure" | "facebook") {
    if (loading) return;
    setLoading(provider);
    setError("");
    setNotice("");
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
          ...(provider === "azure" ? { scopes: "email" } : {}),
        },
      });
      if (authError) throw authError;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      setLoading("");
    }
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setNotice("");
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading("email");
    try {
      const supabase = createClient();
      if (mode === "forgot") {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (authError) throw authError;
        setNotice("If this address has an account, a password reset email will arrive shortly.");
      } else if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (authError) throw authError;
        if (data.session) window.location.assign("/");
        else setNotice("Check your email to confirm your account before signing in.");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(), password,
        });
        if (authError) throw authError;
        window.location.assign("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading("");
    }
  }

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="flex min-h-screen flex-col lg:flex-row">

        {/* LEFT BRANDING PANEL */}
        <section className="relative flex min-h-[420px] flex-col justify-between overflow-hidden bg-[#081426] px-7 py-8 text-white sm:px-12 lg:min-h-screen lg:w-[55%] lg:px-16 lg:py-12">

          {/* Background effects */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-32 -top-32 h-[450px] w-[450px] rounded-full bg-blue-600/20 blur-3xl"
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-48 -left-32 h-[500px] w-[500px] rounded-full bg-cyan-500/10 blur-3xl"
          />

          {/* Logo */}
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500 shadow-lg shadow-blue-500/20">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 17l6-6 4 4 8-9" />
                <path d="M15 6h6v6" />
              </svg>
            </div>

            <span className="text-2xl font-bold tracking-tight">
              ProfitSync
            </span>
          </div>

          {/* Main branding content */}
          <div className="relative z-10 my-12 max-w-xl lg:my-0">

            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-4 py-2 text-xs font-semibold tracking-wide text-blue-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              BUILT FOR EBAY SELLERS
            </div>

            <h1 className="text-4xl font-bold leading-[1.12] tracking-tight sm:text-5xl xl:text-6xl">
              Know your numbers.
              <span className="mt-2 block text-blue-400">
                Grow your profits.
              </span>
            </h1>

            <p className="mt-6 max-w-md text-base leading-8 text-slate-300 sm:text-lg">
              Your sales, fees, and product costs in one
              place. Spend less time calculating and more
              time growing your business.
            </p>

            {/* Dashboard preview */}
            <div className="mt-10 max-w-lg rounded-2xl border border-white/10 bg-white/[0.07] p-4 shadow-2xl backdrop-blur-sm sm:p-5">

              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Profit overview
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Example dashboard
                  </p>
                </div>

                <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Overview
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
                  <p className="text-xs text-slate-400">
                    Revenue
                  </p>
                  <p className="mt-2 text-2xl font-bold">
                    $8,450
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    Total sales
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] p-4">
                  <p className="text-xs text-emerald-200">
                    Net profit
                  </p>
                  <p className="mt-2 text-2xl font-bold text-emerald-400">
                    $2,735
                  </p>
                  <p className="mt-2 text-xs text-emerald-200/70">
                    After expenses
                  </p>
                </div>
              </div>

              {/* Decorative chart */}
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    Sales performance
                  </span>
                  <span className="text-xs text-slate-500">
                    Illustrative
                  </span>
                </div>

                <svg
                  viewBox="0 0 420 110"
                  className="h-24 w-full"
                  role="img"
                  aria-label="Illustrative upward-trending sales chart"
                >
                  <defs>
                    <linearGradient
                      id="profitArea"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#3b82f6"
                        stopOpacity="0.35"
                      />
                      <stop
                        offset="100%"
                        stopColor="#3b82f6"
                        stopOpacity="0"
                      />
                    </linearGradient>
                  </defs>

                  <path
                    d="M0 95 L45 83 L90 87 L135 59 L180 69 L225 46 L270 55 L315 24 L360 37 L420 9 L420 110 L0 110 Z"
                    fill="url(#profitArea)"
                  />

                  <path
                    d="M0 95 L45 83 L90 87 L135 59 L180 69 L225 46 L270 55 L315 24 L360 37 L420 9"
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>

          <p className="relative z-10 hidden text-sm text-slate-500 lg:block">
            ProfitSync · Smarter profit tracking for sellers
          </p>
        </section>

        {/* RIGHT LOGIN PANEL */}
        <section className="flex flex-1 flex-col bg-white">

          <div className="flex justify-end px-7 py-7 sm:px-12">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500">
              Seller Dashboard
            </span>
          </div>

          <div className="flex flex-1 items-center justify-center px-7 py-12 sm:px-12">
            <div className="w-full max-w-[420px]">

              {/* Login icon */}
              <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect
                    x="3"
                    y="3"
                    width="18"
                    height="18"
                    rx="4"
                  />
                  <path d="M7 15l4-4 3 3 4-5" />
                </svg>
              </div>

              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Welcome to ProfitSync
              </h2>

              <p className="mt-4 leading-7 text-slate-500">
                Sign in to access your dashboard and
                manage your eBay sales, expenses, and profits.
              </p>

              <div className="mt-8">
                <div className="mb-6 flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">
                  {(["signin", "signup"] as const).map((tab) => (
                    <button key={tab} type="button" onClick={() => { setMode(tab); setError(""); setNotice(""); }}
                      className={`flex-1 rounded-lg px-3 py-3 transition ${mode === tab ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                      {tab === "signin" ? "Sign in" : "Create account"}
                    </button>
                  ))}
                </div>
                <h3 className="mb-5 text-xl font-bold text-slate-900">
                  {mode === "forgot" ? "Reset your password" : mode === "signup" ? "Create your seller account" : "Welcome back"}
                </h3>
                <form onSubmit={submitEmail} className="space-y-4">
                  <label className="block text-sm font-medium text-slate-700">
                    Email address
                    <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  </label>
                  {mode !== "forgot" && <label className="block text-sm font-medium text-slate-700">
                    Password
                    <input type="password" minLength={mode === "signup" ? 6 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  </label>}
                  {mode === "signup" && <label className="block text-sm font-medium text-slate-700">
                    Confirm password
                    <input type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  </label>}
                  {mode === "signin" && <button type="button" onClick={() => { setMode("forgot"); setError(""); setNotice(""); }} className="block ml-auto text-sm font-semibold text-blue-600 hover:underline">Forgot password?</button>}
                  <button type="submit" disabled={Boolean(loading)} className="w-full rounded-xl bg-blue-600 px-5 py-3.5 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60">
                    {loading === "email" ? "Please wait..." : mode === "forgot" ? "Send reset link" : mode === "signup" ? "Create account" : "Sign in"}
                  </button>
                  {mode === "forgot" && <button type="button" onClick={() => setMode("signin")} className="w-full text-sm font-medium text-blue-600 hover:underline">Back to sign in</button>}
                </form>
                {mode !== "forgot" && <>
                  <div className="my-6 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />or continue with<span className="h-px flex-1 bg-slate-200" /></div>
                  <div className="space-y-3">
                    {([ ["google", "Google"], ["azure", "Microsoft (Outlook / Hotmail)"], ["facebook", "Facebook"] ] as const).map(([provider, label]) => (
                      <button key={provider} type="button" disabled={Boolean(loading)} onClick={() => socialSignIn(provider)}
                        className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-extrabold ${provider === "google" ? "text-blue-600" : provider === "azure" ? "bg-blue-600 text-white" : "bg-[#1877F2] text-white"}`}>
                          {provider === "google" ? "G" : provider === "azure" ? "M" : "f"}
                        </span>
                        {loading === provider ? "Connecting..." : `Continue with ${label}`}
                      </button>
                    ))}
                  </div>
                  <p className="mt-4 text-center text-xs text-slate-500">Yahoo and other email addresses can register using email and password.</p>
                </>}
                {error && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                {notice && <div role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
                <p className="mt-6 text-center text-xs text-slate-500">Secure authentication powered by Supabase</p>
              </div>

              {/* Features */}
              <div className="mt-12 border-t border-slate-100 pt-8">
                <p className="mb-5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Everything in one dashboard
                </p>

                <div className="grid gap-4">
                  {[
                    "Automatically import eBay orders",
                    "Track seller fees and product costs",
                    "Calculate your net profit",
                  ].map((feature) => (
                    <div
                      key={feature}
                      className="flex items-center gap-3 text-sm text-slate-600"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M5 12l4 4L19 6" />
                        </svg>
                      </span>
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <footer className="px-7 py-7 text-center text-xs text-slate-400 sm:px-12">
            <p>
              © {new Date().getFullYear()} ProfitSync.
              Built to make selling simpler.
            </p>
          </footer>
        </section>
      </div>
    </main>
  );
}
