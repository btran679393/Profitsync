// Sends email through Resend (resend.com) using its HTTP API.
// Needs two settings on the server:
//   RESEND_API_KEY  the Resend API key
//   EMAIL_FROM      who it's from, e.g. "ProfitSync <hello@yourdomain.com>"
//                   (the domain must be verified in Resend)
// Without them nothing is sent.

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

export async function sendEmail(message: {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!key || !from) return { ok: false, error: "Email isn't set up." };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      // Lets email apps show their own "Unsubscribe" button.
      headers: message.unsubscribeUrl
        ? { "List-Unsubscribe": `<${message.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
        : undefined,
    }),
    cache: "no-store",
  });
  if (response.ok) return { ok: true };
  const body = (await response.json().catch(() => ({}))) as { message?: string; name?: string };
  return { ok: false, error: `${response.status} ${body.name ?? ""} ${body.message ?? ""}`.trim() };
}
