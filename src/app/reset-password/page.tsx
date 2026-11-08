"use client";
import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  const [done, setDone] = useState(false);

  // The reset email links here with ?code=... The browser client exchanges
  // that code for a session automatically; getSession() waits for it.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setReady(data.session ? "ok" : "invalid");
    });
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) { setMessage("Passwords do not match."); return; }
    setBusy(true); setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      setDone(true);
      setMessage("Password updated. You can now sign in with your new password.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to reset password. Request a new link."); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#081426] p-6"><div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
    <h1 className="text-2xl font-bold text-slate-900">Set a new password</h1>
    {ready === "checking" && <p className="mt-2 text-sm text-slate-500">Checking your reset link...</p>}
    {ready === "invalid" && <p className="mt-2 text-sm text-red-600">This reset link is invalid or has expired. Open the newest reset email in the same browser you requested it from, or request a new link.</p>}
    {ready === "ok" && !done && <>
      <p className="mt-2 text-sm text-slate-500">Choose a new password for your account.</p>
      <form onSubmit={save} className="mt-6 space-y-4">
        <input type="password" required minLength={6} autoComplete="new-password" placeholder="New password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-xl border p-3 text-slate-900" />
        <input type="password" required minLength={6} autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={e=>setConfirm(e.target.value)} className="w-full rounded-xl border p-3 text-slate-900" />
        <button disabled={busy} className="w-full rounded-xl bg-indigo-600 p-3 font-semibold text-white disabled:opacity-60">{busy ? "Saving..." : "Update password"}</button>
      </form>
    </>}
    {message && <p role="status" className="mt-4 text-sm text-slate-700">{message}</p>}
    <a href="/login" className="mt-5 block text-center text-sm text-indigo-600">Back to sign in</a>
  </div></main>;
}
