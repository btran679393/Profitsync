# Social login setup (Google, Microsoft/Outlook, Facebook)

The code is already in place. The login page only shows a "Continue with …" button
once that provider is **switched on in Supabase**, so you can do these one at a time.

You paste every secret yourself. Never commit secrets to this repo — they live only in
the provider dashboards and in Supabase.

**Your Supabase callback address** (every provider needs this exact value):

```
https://syasfggbfisoxatlxmlj.supabase.co/auth/v1/callback
```

**Status (Nov 6, 2026):**
- Google ✅ on.
- Microsoft ✅ on and tested. App "ProfitSync" lives in your own Azure "Default Directory"
  (signed in as Brandontran391@gmail.com). Client secret expires in 24 months — renew it then.
- Facebook ✅ on and tested by you, but the Meta app is still **Unpublished**: only you (the
  app's admin) can use it until you finish Meta's verification and publish (see section 4).

"Gmail" users use the Google button; "Outlook / Hotmail / Live" users use the Microsoft
button. Anyone else (Yahoo, iCloud, …) signs up with email and password.

---

## 1. Supabase URL settings (do this first, once)

Supabase dashboard → **Authentication → URL Configuration**

- [ ] **Site URL**: your live website address, `https://profitsync-three.vercel.app`
- [ ] **Redirect URLs** — add each of these:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/reset-password`
  - `https://profitsync-three.vercel.app/auth/callback`
  - `https://profitsync-three.vercel.app/reset-password`

If a sign-in sends you to the wrong site (for example the live site while you're testing
on localhost), a missing entry here is almost always why.

---

## 2. Microsoft (Outlook, Hotmail, Live, work and school accounts)

This is the fix for the "your account doesn't exist in this tenant" error. That error
happened because the app was set up inside the Linfield school directory, so Microsoft
only let Linfield accounts in. The new app must accept **everyone**.

### In Microsoft Entra (Azure)

- [ ] Go to <https://entra.microsoft.com> (or <https://portal.azure.com>) and sign in with
      your **personal** Microsoft account (Outlook/Hotmail) — **not** your Linfield account.
  - If it says you need a directory or subscription first, sign up for the free Azure
    account; that creates a personal directory you own.
- [ ] **App registrations → New registration**
  - Name: `ProfitSync`
  - Supported account types: **"Accounts in any organizational directory (Any Microsoft
    Entra ID tenant – Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)"**
  - Redirect URI: platform **Web**, value = the Supabase callback address above
  - Click **Register**
- [ ] On the app's **Overview** page, copy the **Application (client) ID**.
- [ ] **Certificates & secrets → New client secret** → pick the longest expiry (24 months) →
      copy the **Value** column right away (not "Secret ID"; the value is hidden after you
      leave the page).
  - Put a calendar reminder a couple of weeks before it expires. When it expires,
    Microsoft sign-in stops working until you make a new secret and paste it into Supabase.
- [ ] **Token configuration → Add optional claim → ID** → tick `email` and `xms_edov` →
      Add (accept the prompt to add the Microsoft Graph permission). This lets Supabase
      check that a work/school email address is really owned by that organisation.
- [ ] **API permissions**: make sure Microsoft Graph has delegated `email`, `openid`,
      `profile` and `User.Read`. (No admin consent needed for these.)
- [ ] *(Optional, later)* **Branding & properties**: add your logo, home page and privacy
      page (`https://profitsync-three.vercel.app/privacy`). Work/school users may see "unverified
      publisher" until you complete Microsoft publisher verification; some organisations
      block unverified apps — those users can still use email and password.

### In Supabase

- [ ] **Authentication → Sign In / Providers → Azure** → turn it on
  - **Application (client) ID**: paste from Entra
  - **Secret Value**: paste the secret **Value** from Entra
  - **Azure Tenant URL**: **leave blank** (blank means "common" = any account). Do *not*
    put a Linfield or other tenant URL here — that brings the old error back.
- [ ] Save.

---

## 3. Google (already on — just double-check)

<https://console.cloud.google.com> → **APIs & Services**

- [ ] **Credentials → your OAuth 2.0 Client ID** (type "Web application"):
  - **Authorized redirect URIs** contains the Supabase callback address above.
  - **Authorized JavaScript origins** contains `http://localhost:3000` and
    `https://profitsync-three.vercel.app`.
- [ ] **OAuth consent screen / Audience**: publishing status should be **In production**.
      While it says **Testing**, only the test users you listed can sign in — everyone else
      gets "access blocked".
- [ ] App name, support email, logo, home page and privacy page
      (`https://profitsync-three.vercel.app/privacy`) are filled in.

---

## 4. Facebook

### In Meta for Developers

- [ ] Go to <https://developers.facebook.com> → **My Apps → Create App**, signed in with
      your own Facebook account.
  - Use case: **Authenticate and request data from users with Facebook Login**.
  - App name: `ProfitSync`, contact email: yours.
- [ ] **Use cases → Facebook Login → Customize → Permissions**: make sure `email` and
      `public_profile` are added (both are allowed without app review).
- [ ] **Facebook Login → Settings → Valid OAuth Redirect URIs**: paste the Supabase
      callback address above → Save.
- [ ] **App settings → Basic**: fill in **Privacy Policy URL**
      (`https://profitsync-three.vercel.app/privacy`), app icon and category. Copy the **App ID**, then
      click **Show** next to **App Secret** and copy it.
- [ ] Switch the app from **Development** to **Live** (top of the page / "Publish").
      While it's in Development, only people you've added as app testers can sign in.
  - In Meta's newer dashboard the **Publish** button stays greyed out until
    **Review → Verification** ("Start Verification" — verify as a business *or as an
    individual*, which needs a photo ID you upload yourself) is done, and Meta has
    counted at least one test sign-in (can take up to 24 hours). If it asks for App Review
    for `email`, submit it from **Review → App Review**.

### In Supabase

- [ ] **Authentication → Sign In / Providers → Facebook** → turn on, paste **App ID** as
      Client ID and **App Secret** as Client Secret → Save.

Note: some Facebook accounts are made with a phone number and have no email address.
Those people will see "We couldn't get an email address from that account" and can use
another option instead.

---

## 5. Test it

- [ ] Restart `npm run dev`, open <http://localhost:3000/login> — the newly enabled
      provider's button should appear.
- [ ] Sign in with each provider. For Microsoft, try both a personal Outlook/Hotmail
      account **and** a work/school account.
- [ ] After a successful sign-in you should land on the dashboard. If something fails,
      you'll be sent back to the login page with a message, and the full error is in
      Supabase → **Logs → Auth**.

**Same person, different buttons:** if someone signs up with email and later uses
"Continue with Google" with the same (verified) email address, Supabase links both to the
same ProfitSync account, so their eBay data stays together.
