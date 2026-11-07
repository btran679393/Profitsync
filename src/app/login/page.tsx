
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

// Supabase calls Microsoft sign-in "azure". One Microsoft button covers personal
// accounts (Outlook, Hotmail, Live) and work or school accounts.
type SocialProvider = "google" | "azure" | "facebook";

const SOCIAL_PROVIDERS: ReadonlyArray<readonly [SocialProvider, string]> = [
  ["google", "Google"],
  ["azure", "Microsoft"],
  ["facebook", "Facebook"],
];

function ProviderLogo({ provider }: { provider: SocialProvider }) {
  const common = { width: 20, height: 20, "aria-hidden": true } as const;
  if (provider === "google")
    return (
      <svg {...common} viewBox="0 0 24 24">
        <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
        <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
      </svg>
    );
  if (provider === "azure")
    return (
      <svg {...common} viewBox="0 0 23 23">
        <rect x="1" y="1" width="10" height="10" fill="#F25022" />
        <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
        <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
        <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
      </svg>
    );
  return (
    <svg {...common} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path fill="#fff" d="M16.67 15.47 17.2 12h-3.33V9.75c0-.95.47-1.87 1.96-1.87h1.51V4.92s-1.37-.23-2.68-.23c-2.74 0-4.53 1.66-4.53 4.66V12H7.08v3.47h3.05V24h3.75v-8.53z" />
    </svg>
  );
}

// Turn Supabase / OAuth error codes and messages into something a seller can act on.
function friendlyAuthError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("provider is not enabled") || msg.includes("unsupported provider"))
    return "That sign-in option isn't available yet. Please use another option or your email and password.";
  // Microsoft: the app registration only accepts one organisation's accounts
  // (e.g. a school tenant) instead of "any organisation + personal accounts".
  if (msg.includes("aadsts50020") || msg.includes("aadsts50194") || msg.includes("does not exist in tenant") || msg.includes("not configured as a multi-tenant"))
    return "Microsoft sign-in isn't accepting this type of account yet. Please try a personal Outlook/Hotmail account, another sign-in option, or your email and password.";
  // Microsoft work/school accounts whose organisation requires admin approval.
  if (msg.includes("aadsts65001") || msg.includes("aadsts90094") || msg.includes("admin approval") || msg.includes("need admin"))
    return "Your organisation needs to approve ProfitSync before you can sign in with this work or school account. Try a personal account or your email and password instead.";
  if (msg.includes("error getting user email"))
    return "We couldn't get an email address from that account. Please make sure it has a verified email, or sign in another way.";
  if (msg.includes("unable to exchange external code") || msg.includes("aadsts7000215") || msg.includes("invalid client secret"))
    return "Sign-in with that provider isn't set up correctly right now. Please try another option or your email and password.";
  if (msg.includes("invalid login credentials"))
    return "Incorrect email or password.";
  if (msg.includes("email not confirmed"))
    return "Please confirm your email first. Check your inbox (and spam folder) for the confirmation link.";
  if (msg.includes("user already registered"))
    return "An account with this email already exists. Try signing in, or use \"Forgot password?\".";
  if (msg.includes("email_address_not_authorized") || msg.includes("not authorized"))
    return "We couldn't send an email to this address right now. Please try a Google, Microsoft or Facebook sign-in instead, or try again later.";
  if (msg.includes("rate limit") || msg.includes("over_email_send_rate_limit"))
    return "Too many emails were sent recently. Please wait a few minutes and try again.";
  if (msg.includes("access_denied"))
    return "Sign-in was cancelled.";
  if (msg.includes("missing_code") || msg.includes("auth_failed") || msg.includes("code verifier") || msg.includes("bad_oauth_state"))
    return "Sign-in didn't complete. Please try again in the same browser.";
  return raw;
}

export default function LoginPage() {
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Which social providers are switched on in Supabase. null = still checking.
  const [enabledProviders, setEnabledProviders] = useState<SocialProvider[] | null>(null);

  useEffect(() => {
    // Show errors passed back from /auth/callback (e.g. cancelled consent).
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get("error_description") || params.get("error");
    if (urlError) setError(friendlyAuthError(urlError));

    // Only show buttons for providers that are enabled in the Supabase dashboard,
    // so nobody lands on a raw "provider is not enabled" error page.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key ?? "" } })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((settings: { external?: Record<string, boolean> }) => {
        const ext = settings.external ?? {};
        setEnabledProviders(SOCIAL_PROVIDERS.map(([p]) => p).filter((p) => ext[p]));
      })
      .catch(() => setEnabledProviders(SOCIAL_PROVIDERS.map(([p]) => p)));
  }, []);

  async function socialSignIn(provider: SocialProvider) {
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
          // Ask Microsoft for the email address and name. "openid" makes it a
          // standard sign-in; offline access isn't needed (Supabase keeps its own session).
          ...(provider === "azure" ? { scopes: "openid email profile", queryParams: { prompt: "select_account" } } : {}),
        },
      });
      if (authError) throw authError;
    } catch (err) {
      setError(err instanceof Error ? friendlyAuthError(err.message) : "Sign-in failed. Please try again.");
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
      setError(err instanceof Error ? friendlyAuthError(err.message) : "Authentication failed.");
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
                {mode !== "forgot" && enabledProviders !== null && enabledProviders.length > 0 && <>
                  <div className="my-6 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />or continue with<span className="h-px flex-1 bg-slate-200" /></div>
                  <div className="space-y-3">
                    {SOCIAL_PROVIDERS.filter(([provider]) => enabledProviders.includes(provider)).map(([provider, label]) => (
                      <button key={provider} type="button" disabled={Boolean(loading)} onClick={() => socialSignIn(provider)}
                        className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">
                        <ProviderLogo provider={provider} />
                        {loading === provider ? "Connecting..." : `Continue with ${label}`}
                      </button>
                    ))}
                  </div>
                  <p className="mt-4 text-center text-xs text-slate-500">
                    {enabledProviders.includes("azure") && "Microsoft works with Outlook, Hotmail, Live and work or school accounts. "}
                    Yahoo, iCloud and any other email address can sign up with email and password.
                  </p>
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
