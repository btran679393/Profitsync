import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/site/SiteChrome";
import { LEGAL_UPDATED, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What information ProfitSync collects, how it's used, who helps us run the service, and how to delete your data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated={LEGAL_UPDATED}
      intro={
        <p>
          ProfitSync helps eBay sellers track sales, costs and profit. This policy explains what information we collect, why, who helps us
          handle it, and the choices you have. In short: we use your information only to run ProfitSync for you. We don&apos;t sell it,
          and we don&apos;t use it for advertising.
        </p>
      }
    >
      <h2>1. Information we collect</h2>
      <p>
        <strong>Your account.</strong> Your email address and, if you sign in with Google, Microsoft or Facebook, the name, email and
        account ID that service shares with us. If you use a password, it is stored securely by our sign-in provider; we never see it.
      </p>
      <p>
        <strong>Your eBay information.</strong> When you connect an eBay store, we receive your eBay user ID and store name, and the
        information needed to work out your profit: orders (item titles, item numbers, quantities, sale amounts, order dates and the
        buyer&apos;s eBay username), listings (titles, prices, photos and stock), and payment records (eBay fees, shipping labels bought
        through eBay, refunds and payouts). We also keep the access tokens eBay gives us so we can sync on your behalf.
      </p>
      <p>
        <strong>What you enter.</strong> Product costs, shipping costs, expenses, refund notes, goals and settings.
      </p>
      <p>
        <strong>Billing.</strong> If you choose a paid plan, Stripe handles your payment. We receive and store your Stripe customer ID,
        your plan, your billing period and whether your subscription is active. We never see or store your full card number.
      </p>
      <p>
        <strong>Technical information.</strong> Basic logs (like time, page requested, browser type and IP address) that our hosting
        provider records to keep the service secure and working.
      </p>

      <h2>2. How we use it</h2>
      <ul>
        <li>to show your sales, fees, costs, expenses and profit, and to build your reports and tax summary;</li>
        <li>to sync with eBay and keep your stores up to date;</li>
        <li>to manage your plan and payments;</li>
        <li>to send account emails, such as sign-up confirmation, password reset and important changes to the service;</li>
        <li>to keep ProfitSync secure, fix problems and improve features.</li>
      </ul>
      <p>
        ProfitSync only <strong>reads</strong> your eBay information. It never changes your listings, orders, refunds or payouts.
      </p>

      <h2>3. Who helps us run ProfitSync</h2>
      <p>We share information only with the services that run ProfitSync, and only what each one needs:</p>
      <ul>
        <li><strong>Supabase</strong>: sign-in and database storage.</li>
        <li><strong>Vercel</strong>: website and app hosting.</li>
        <li><strong>eBay</strong>: the source of your store information, which you connect yourself.</li>
        <li><strong>Stripe</strong>: payment processing for paid plans.</li>
        <li><strong>Google, Microsoft and Facebook</strong>: only if you choose to sign in with them.</li>
        <li><strong>An email delivery provider</strong>: to send account emails.</li>
      </ul>
      <p>
        Each of these handles information under its own privacy policy. We may also share information if the law requires it, or to
        protect ProfitSync and its users from fraud or abuse. If ProfitSync is ever sold or merged, your information would move to the
        new owner under this policy, and we&apos;d tell you first.
      </p>
      <p>
        <strong>We do not sell or rent your personal information</strong>, and we don&apos;t share it for advertising.
      </p>

      <h2>4. Cookies and storage</h2>
      <p>
        ProfitSync uses only essential cookies, to keep you signed in. Your browser also remembers display choices, like light or dark
        mode and whether the sidebar is collapsed. We don&apos;t use advertising or tracking cookies.
      </p>

      <h2>5. How long we keep it</h2>
      <p>
        We keep your information while your account is open. When you delete your account, we delete your account, connected stores,
        orders, listings, costs and expenses from our database straight away. Copies in our providers&apos; backups are removed on
        their normal schedule, usually within 30 days. We may keep billing records where tax law requires it.
      </p>
      <p>
        When you disconnect a store, that store&apos;s information is deleted from ProfitSync. If eBay tells us an eBay account has
        been closed, we delete that seller&apos;s store information and any orders where that account was the buyer.
      </p>

      <h2>6. Your choices and rights</h2>
      <ul>
        <li><strong>See and download</strong> your orders as a spreadsheet from the Orders page.</li>
        <li><strong>Correct</strong> costs, expenses and settings any time in the app.</li>
        <li><strong>Disconnect</strong> an eBay store in ProfitSync, or remove ProfitSync&apos;s access in your eBay account settings.</li>
        <li><strong>Delete</strong> your account and data in Settings → Delete account, or by emailing us.</li>
      </ul>
      <p>
        Depending on where you live (for example California, the EU or the UK), you may have extra rights, such as asking what
        information we hold about you. Email us and we&apos;ll respond within 30 days. We won&apos;t treat you differently for using
        these rights.
      </p>

      <h2>7. Security</h2>
      <p>
        Information is sent over encrypted connections, each account can only see its own data, and eBay access tokens are stored
        securely. No online service can be perfectly secure, so please use a strong password and tell us about anything suspicious.
      </p>

      <h2>8. Children</h2>
      <p>ProfitSync is for sellers aged 18 and over. We don&apos;t knowingly collect information from children.</p>

      <h2>9. Changes to this policy</h2>
      <p>
        If we change this policy, we&apos;ll update the date at the top. For important changes we&apos;ll also tell you by email or in
        the app.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions, or a request about your information? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or visit our{" "}
        <Link href="/contact">contact page</Link>.
      </p>
    </LegalPage>
  );
}
