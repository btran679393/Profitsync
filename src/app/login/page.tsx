
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signInWithGoogle() {
    if (loading) return;

    try {
      setLoading(true);
      setError("");

      const supabase = createClient();

      const { error: authError } =
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: {
        prompt: "select_account",
      },
    },
  });

      if (authError) {
        throw authError;
      }
    } catch (err) {
      console.error("Google login failed:", err);
      setError(
        "Unable to sign in with Google. Please try again."
      );
      setLoading(false);
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

              <div className="mt-10">
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  disabled={loading}
                  className="group flex min-h-14 w-full items-center justify-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  ) : (
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 48 48"
                      aria-hidden="true"
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.27 5.48-4.79 7.18l7.73 6C44.39 38.03 46.98 31.88 46.98 24.55z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.2A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.92-2.13 15.89-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                  )}

                  <span>
                    {loading
                      ? "Connecting to Google..."
                      : "Continue with Google"}
                  </span>
                </button>

                {error && (
                  <div
                    role="alert"
                    className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  >
                    {error}
                  </div>
                )}

                <div className="mt-7 flex items-center justify-center gap-2 text-sm text-slate-500">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect
                      x="5"
                      y="10"
                      width="14"
                      height="11"
                      rx="2"
                    />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  </svg>
                  Secure sign-in powered by Google
                </div>
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
