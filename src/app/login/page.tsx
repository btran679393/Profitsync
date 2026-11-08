"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import BrandPanel from "./BrandPanel";

// Supabase calls Microsoft sign-in "azure". One Microsoft button covers personal
// accounts (Outlook, Hotmail, Live) and work or school accounts.
type SocialProvider = "google" | "azure" | "facebook";
type Mode = "signin" | "signup" | "forgot";

const SOCIAL_PROVIDERS: ReadonlyArray<readonly [SocialProvider, string]> = [
  ["google", "Google"],
  ["azure", "Microsoft"],
  ["facebook", "Facebook"],
];

const COPY: Record<Mode, { title: string; subtitle: string; submit: string }> = {
  signin: {
    title: "Welcome back",
    subtitle: "Sign in to see your sales, fees and profit.",
    submit: "Sign in",
  },
  signup: {
    title: "Create your account",
    subtitle: "Start tracking your real eBay profit in minutes.",
    submit: "Create account",
  },
  forgot: {
    title: "Reset your password",
    subtitle: "Enter your email and we'll send you a link to choose a new password.",
    submit: "Send reset link",
  },
};

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

function Icon({ name, className = "" }: { name: "mail" | "lock" | "eye" | "eyeOff" | "arrow" | "alert" | "check" | "shield"; className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "mail" && <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></>}
      {name === "lock" && <><rect x="4" y="11" width="16" height="10" rx="2.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>}
      {name === "eye" && <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>}
      {name === "eyeOff" && <><path d="M10.6 5.1A9.9 9.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.5M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="m3 3 18 18" /></>}
      {name === "arrow" && <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>}
      {name === "alert" && <><circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" /></>}
      {name === "check" && <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>}
      {name === "shield" && <><path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>}
    </svg>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-md shadow-indigo-600/25">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 17l6-6 4 4 8-9" />
          <path d="M15 6h6v6" />
        </svg>
      </div>
      <span className="text-lg font-bold tracking-tight text-slate-900">ProfitSync</span>
    </div>
  );
}

const INPUT =
  "h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-[15px] text-slate-900 shadow-sm shadow-slate-900/[0.03] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10";

function Field({ label, icon, aside, children }: { label: string; icon: "mail" | "lock"; aside?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-slate-700">
        {label}
        {aside}
      </span>
      <span className="relative block">
        <Icon name={icon} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        {children}
      </span>
    </label>
  );
}

// 0 = too short … 4 = strong. Advice only; Supabase enforces the real minimum.
function passwordStrength(pw: string) {
  if (pw.length < 6) return 0;
  let score = 1;
  if (pw.length >= 10) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

const STRENGTH = [
  { label: "Too short", bar: "bg-rose-400", text: "text-rose-600" },
  { label: "Weak", bar: "bg-orange-400", text: "text-orange-600" },
  { label: "Fair", bar: "bg-amber-400", text: "text-amber-600" },
  { label: "Good", bar: "bg-lime-500", text: "text-lime-700" },
  { label: "Strong", bar: "bg-emerald-500", text: "text-emerald-700" },
];

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
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Which social providers are switched on in Supabase. null = still checking.
  const [enabledProviders, setEnabledProviders] = useState<SocialProvider[] | null>(null);

  useEffect(() => {
    // Show errors passed back from /auth/callback (e.g. cancelled consent).
    // Set after the first render so server and browser HTML match.
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get("error_description") || params.get("error");
    const showError = window.setTimeout(() => {
      if (urlError) setError(friendlyAuthError(urlError));
    }, 0);

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
    return () => window.clearTimeout(showError);
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setNotice("");
    setShowPassword(false);
  }

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
        // Full page load on purpose so the new sign-in cookies reach the server.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        if (data.session) window.location.assign("/");
        else setNotice("Check your email to confirm your account before signing in.");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(), password,
        });
        if (authError) throw authError;
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/");
      }
    } catch (err) {
      setError(err instanceof Error ? friendlyAuthError(err.message) : "Authentication failed.");
    } finally {
      setLoading("");
    }
  }

  const copy = COPY[mode];
  const strength = passwordStrength(password);
  const passwordsMatch = confirmPassword.length > 0 && confirmPassword === password;
  const providers = enabledProviders ?? [];

  return (
    <main className="ps-motion min-h-screen bg-white font-sans text-slate-900 lg:flex">
      <BrandPanel />

      {/* FORM PANEL */}
      <section className="relative flex min-h-screen flex-1 flex-col overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.08),transparent_70%)]"
        />

        {/* Top bar */}
        <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
          <div className="lg:invisible">
            <Logo />
          </div>
          <p className="hidden text-sm text-slate-500 sm:block">
            {mode === "signup" ? "Already have an account?" : "New to ProfitSync?"}{" "}
            <button
              type="button"
              onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
              className="font-semibold text-indigo-600 transition hover:text-indigo-700"
            >
              {mode === "signup" ? "Sign in" : "Create account"}
            </button>
          </p>
        </header>

        <div className="relative z-10 flex flex-1 items-center justify-center px-6 pb-10 sm:px-10">
          <div className="w-full max-w-[400px]">
            {/* Heading */}
            <div key={mode} className="ps-fade-up">
              <h2 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">
                {copy.title}
              </h2>
              <p className="mt-2 text-[15px] leading-6 text-slate-500">{copy.subtitle}</p>
            </div>

            {/* Sign in / Create account switch */}
            {mode !== "forgot" && (
              <div className="ps-fade-up relative mt-7 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold" style={{ animationDelay: "60ms" }}>
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm ring-1 ring-slate-900/5 transition-transform duration-300 ease-out ${mode === "signup" ? "translate-x-full" : ""}`}
                />
                {(["signin", "signup"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => switchMode(tab)}
                    aria-pressed={mode === tab}
                    className={`relative z-10 rounded-lg py-2.5 transition-colors ${mode === tab ? "text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    {tab === "signin" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>
            )}

            {/* Social sign-in */}
            {mode !== "forgot" && (enabledProviders === null || providers.length > 0) && (
              <div className="ps-fade-up mt-6" style={{ animationDelay: "120ms" }}>
                <div className="space-y-2.5">
                  {enabledProviders === null
                    ? [0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />)
                    : SOCIAL_PROVIDERS.filter(([p]) => providers.includes(p)).map(([provider, label]) => (
                        <button
                          key={provider}
                          type="button"
                          disabled={Boolean(loading)}
                          onClick={() => socialSignIn(provider)}
                          className="group relative flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-[15px] font-semibold text-slate-700 shadow-sm shadow-slate-900/[0.03] transition hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:translate-y-0 disabled:pointer-events-none disabled:opacity-60"
                        >
                          {loading === provider ? <Spinner className="text-slate-500" /> : <ProviderLogo provider={provider} />}
                          {loading === provider ? "Connecting…" : `Continue with ${label}`}
                        </button>
                      ))}
                </div>
                {providers.includes("azure") && (
                  <p className="mt-2.5 text-center text-xs text-slate-400">
                    Microsoft works with Outlook, Hotmail and work or school accounts.
                  </p>
                )}
                <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />
                  or with email
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
              </div>
            )}

            {/* Email form */}
            <form
              onSubmit={submitEmail}
              className={`ps-fade-up space-y-4 ${mode === "forgot" ? "mt-7" : ""}`}
              style={{ animationDelay: "180ms" }}
            >
              <Field label="Email address" icon="mail">
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={INPUT}
                />
              </Field>

              {mode !== "forgot" && (
                <div>
                  <Field
                    label="Password"
                    icon="lock"
                    aside={
                      mode === "signin" && (
                        <button type="button" onClick={() => switchMode("forgot")} className="text-sm font-semibold text-indigo-600 transition hover:text-indigo-700">
                          Forgot password?
                        </button>
                      )
                    }
                  >
                    <input
                      type={showPassword ? "text" : "password"}
                      minLength={mode === "signup" ? 6 : undefined}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "signup" ? "At least 6 characters" : "Enter your password"}
                      className={`${INPUT} pr-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    >
                      <Icon name={showPassword ? "eyeOff" : "eye"} />
                    </button>
                  </Field>

                  {mode === "signup" && password.length > 0 && (
                    <div className="ps-fade-in mt-2.5" aria-live="polite">
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4].map((n) => (
                          <span
                            key={n}
                            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${strength >= n ? STRENGTH[strength].bar : "bg-slate-200"}`}
                          />
                        ))}
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500">
                        Password strength: <span className={`font-semibold ${STRENGTH[strength].text}`}>{STRENGTH[strength].label}</span>
                        {strength < 3 && " · try 10+ characters with numbers and symbols"}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {mode === "signup" && (
                <Field
                  label="Confirm password"
                  icon="lock"
                  aside={passwordsMatch && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                      <Icon name="check" className="h-4 w-4" /> Matches
                    </span>
                  )}
                >
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className={INPUT}
                  />
                </Field>
              )}

              <button
                type="submit"
                disabled={Boolean(loading)}
                className="group relative mt-2 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 text-[15px] font-semibold text-white shadow-lg shadow-indigo-600/25 ring-1 ring-inset ring-white/15 transition hover:to-indigo-700 hover:shadow-xl hover:shadow-indigo-600/30 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-70"
              >
                <span aria-hidden="true" className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                {loading === "email" ? (
                  <>
                    <Spinner /> Please wait…
                  </>
                ) : (
                  <>
                    {copy.submit}
                    <Icon name="arrow" className="transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>

              {mode === "forgot" && (
                <button type="button" onClick={() => switchMode("signin")} className="w-full text-sm font-semibold text-indigo-600 transition hover:text-indigo-700">
                  ← Back to sign in
                </button>
              )}
            </form>

            {/* Messages */}
            {error && (
              <div role="alert" className="ps-fade-up mt-5 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <Icon name="alert" className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {notice && (
              <div role="status" className="ps-fade-up mt-5 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <Icon name="check" className="mt-0.5 shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            {mode === "signup" && (
              <p className="mt-5 text-center text-xs leading-5 text-slate-500">
                By creating an account you agree to how we handle your data in our{" "}
                <Link href="/privacy" className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-500">
                  Privacy Policy
                </Link>
                .
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="relative z-10 flex flex-col items-center justify-between gap-2 px-6 py-6 text-xs text-slate-400 sm:flex-row sm:px-10">
          <p>© {new Date().getFullYear()} ProfitSync</p>
          <div className="flex items-center gap-4">
            <Link href="/pricing" className="transition hover:text-slate-600">Pricing</Link>
            <Link href="/privacy" className="transition hover:text-slate-600">Privacy</Link>
            <span className="flex items-center gap-1.5">
              <Icon name="shield" className="h-3.5 w-3.5" />
              Secured by Supabase
            </span>
          </div>
        </footer>
      </section>
    </main>
  );
}
