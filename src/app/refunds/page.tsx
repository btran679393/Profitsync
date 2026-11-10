import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/site/SiteChrome";
import { LEGAL_UPDATED, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Refund and cancellation policy",
  description: "How to cancel a ProfitSync plan, and when you can get a refund.",
  alternates: { canonical: "/refunds" },
};

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund and cancellation policy"
      updated={LEGAL_UPDATED}
      intro={
        <p>
          We want ProfitSync to be easy to try and easy to leave. The Free plan lets you use ProfitSync with one eBay store before you
          pay anything, and you can cancel a paid plan whenever you like.
        </p>
      }
    >
      <h2>Cancelling</h2>
      <ul>
        <li>
          Cancel any time in the app: open <strong>Plan &amp; billing</strong> and choose <strong>Cancel paid plan</strong>. No email
          or phone call needed.
        </li>
        <li>
          Your paid plan keeps working until the end of the month or year you&apos;ve already paid for. After that your account moves to
          the Free plan and you won&apos;t be charged again.
        </li>
        <li>Your data stays in your account after cancelling. Delete your account in Settings if you want it removed.</li>
      </ul>

      <h2>Refunds</h2>
      <p>
        Paid plans are charged at the start of each billing period. Because you can cancel at any time and keep access until the period
        ends, we don&apos;t usually refund part-used months or years. We <strong>will</strong> give a full refund when:
      </p>
      <ul>
        <li>you were charged after you had already cancelled;</li>
        <li>you were charged twice for the same period, or charged the wrong amount;</li>
        <li>
          you bought a <strong>yearly</strong> plan for the first time and ask for a refund within <strong>14 days</strong> of the charge;
        </li>
        <li>ProfitSync was unavailable for a long stretch of a period you paid for because of a problem on our side.</li>
      </ul>
      <p>We&apos;ll also refund wherever the law where you live requires it.</p>

      <h2>Changing plans</h2>
      <ul>
        <li>
          Switching plans (for example Pro to Ultimate, or monthly to yearly) takes effect straight away. You&apos;re charged only the
          difference for the rest of the current period.
        </li>
        <li>
          Moving to a cheaper plan also takes effect straight away, and the unused part of what you paid is credited toward your future
          bills. Stores or features beyond the smaller plan&apos;s limits are paused, not deleted.
        </li>
      </ul>

      <h2>How to ask for a refund</h2>
      <p>
        Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the email address on your ProfitSync account, with the date
        and amount of the charge. We reply within 2 business days. Approved refunds go back to your original payment method; your bank
        usually shows them within 5–10 business days.
      </p>

      <p>
        See also our <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy policy</Link>.
      </p>
    </LegalPage>
  );
}
