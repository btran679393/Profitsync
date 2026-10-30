"use client";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) { setMessage("Passwords do not match."); return; }
    setBusy(true); setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage("Password updated. You can now sign in.");
      await supabase.auth.signOut();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to reset password. Request a new link."); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#081426] p-6"><div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
    <h1 className="text-2xl font-bold text-slate-900">Set a new password</h1>
    <p className="mt-2 text-sm text-slate-500">Open this page from your password reset email.</p>
    <form onSubmit={save} className="mt-6 space-y-4">
      <input type="password" required minLength={6} autoComplete="new-password" placeholder="New password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-xl border p-3 text-slate-900" />
      <input type="password" required minLength={6} autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={e=>setConfirm(e.target.value)} className="w-full rounded-xl border p-3 text-slate-900" />
      <button disabled={busy} className="w-full rounded-xl bg-blue-600 p-3 font-semibold text-white disabled:opacity-60">{busy ? "Saving..." : "Update password"}</button>
    </form>
    {message && <p role="status" className="mt-4 text-sm text-slate-700">{message}</p>}
    <a href="/login" className="mt-5 block text-center text-sm text-blue-600">Back to sign in</a>
  </div></main>;
}
