import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/site/SiteChrome";
import { LEGAL_UPDATED, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using ProfitSync, including plans, billing, cancellation and your data.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={LEGAL_UPDATED}
      intro={
        <p>
          These terms explain the agreement between you and ProfitSync (&quot;ProfitSync&quot;, &quot;we&quot;, &quot;us&quot;) when you use
          the ProfitSync website and app (the &quot;Service&quot;). By creating an account or using the Service, you agree to these terms.
          If you don&apos;t agree, please don&apos;t use ProfitSync.
        </p>
      }
    >
      <h2>1. What ProfitSync does</h2>
      <p>
        ProfitSync helps eBay sellers see their sales, fees, shipping, refunds, product costs and expenses in one place, and estimates
        profit from that information. ProfitSync is an independent service. It is not affiliated with, endorsed by or sponsored by eBay
        Inc.
      </p>

      <h2>2. Who can use ProfitSync</h2>
      <p>
        You must be at least 18 years old and able to enter a binding agreement. If you use ProfitSync for a business, you confirm you
        are allowed to accept these terms for that business.
      </p>

      <h2>3. Your account</h2>
      <ul>
        <li>Give accurate information when you sign up and keep your sign-in details safe.</li>
        <li>You are responsible for what happens under your account. Tell us straight away if you think someone else has accessed it.</li>
        <li>One person or business per account. Don&apos;t share your account or resell access to the Service.</li>
      </ul>

      <h2>4. Connecting eBay</h2>
      <p>
        When you connect an eBay account, you authorize ProfitSync to read the eBay information needed to run the Service, such as
        orders, listings, fees, shipping labels, refunds and payouts. ProfitSync only reads this information; it does not change your
        listings, orders, refunds or payouts. You can disconnect a store in ProfitSync, or remove ProfitSync&apos;s access in your eBay
        account settings, at any time. You must only connect eBay accounts you own or are authorized to manage.
      </p>

      <h2>5. Plans, billing and renewals</h2>
      <ul>
        <li>
          ProfitSync has a Free plan and paid plans (currently Pro and Ultimate), billed monthly or yearly. What each plan includes is
          shown on the <Link href="/pricing">pricing page</Link>.
        </li>
        <li>
          Paid plans are charged in advance and <strong>renew automatically</strong> at the end of each billing period until you cancel.
        </li>
        <li>
          Payments are processed by Stripe. ProfitSync never sees or stores your full card number. You agree to Stripe&apos;s terms when
          you pay.
        </li>
        <li>Prices are in US dollars and may not include taxes that apply where you live, which will be shown at checkout.</li>
        <li>
          If we change the price of your plan, we&apos;ll tell you by email at least 30 days before the new price applies to your next
          renewal. You can cancel before then.
        </li>
        <li>If a payment fails, we may limit your account to the Free plan&apos;s features until the payment goes through.</li>
      </ul>

      <h2>6. Cancelling and refunds</h2>
      <p>
        You can cancel any time from <strong>Plan &amp; billing</strong> in the app. Your paid plan stays active until the end of the
        period you&apos;ve paid for, and you won&apos;t be charged again. Refunds are covered by our{" "}
        <Link href="/refunds">Refund and cancellation policy</Link>.
      </p>

      <h2>7. Plan limits and changing plans</h2>
      <p>
        Each plan has limits, such as the number of eBay stores and orders imported per month. If you move to a smaller plan, your
        data is kept, but stores or features beyond the new plan&apos;s limits are paused until you upgrade again.
      </p>

      <h2>8. Your data</h2>
      <p>
        You own the information you bring into ProfitSync, including your eBay data, costs and expenses. You give us permission to
        store and process it only to provide the Service to you. How we handle it is described in our{" "}
        <Link href="/privacy">Privacy policy</Link>. You can download your orders as a spreadsheet and delete your account at any time.
      </p>

      <h2>9. Not financial or tax advice</h2>
      <p>
        ProfitSync&apos;s numbers, including profit figures and the yearly tax summary, are estimates based on information from eBay and
        what you enter. They may be incomplete or delayed if eBay&apos;s information changes or you haven&apos;t entered all your costs.
        ProfitSync does not give accounting, tax, legal or financial advice. Check important figures, and talk to a qualified
        professional before you file taxes or make financial decisions.
      </p>

      <h2>10. Acceptable use</h2>
      <p>Please don&apos;t:</p>
      <ul>
        <li>break the law, or eBay&apos;s rules, while using ProfitSync;</li>
        <li>try to access other people&apos;s accounts or data, or the systems that run ProfitSync, without permission;</li>
        <li>overload, disrupt, scrape or reverse-engineer the Service, or get around plan limits;</li>
        <li>upload anything harmful, such as malware.</li>
      </ul>

      <h2>11. Availability and changes</h2>
      <p>
        We work to keep ProfitSync running smoothly, but it may sometimes be unavailable, for example during maintenance or when eBay
        or another provider has a problem. We may improve, change or remove features over time. If we make a change that
        significantly reduces what a paid plan includes, we&apos;ll tell you in advance.
      </p>

      <h2>12. Ending your use</h2>
      <p>
        You can stop using ProfitSync and delete your account at any time from Settings. We may suspend or close an account that breaks
        these terms or puts the Service or other users at risk. Where reasonable, we&apos;ll tell you first and give you a chance to fix
        the problem.
      </p>

      <h2>13. Disclaimers</h2>
      <p>
        ProfitSync is provided &quot;as is&quot; and &quot;as available&quot;. To the fullest extent the law allows, we make no promises
        that the Service will be error-free or uninterrupted, or that its figures will be complete or accurate for your purposes.
      </p>

      <h2>14. Limitation of liability</h2>
      <p>
        To the fullest extent the law allows, ProfitSync is not liable for indirect, incidental, special or consequential losses, or for
        lost profits, revenue or data. Our total liability for any claim about the Service is limited to the amount you paid ProfitSync
        in the 12 months before the claim. Nothing in these terms limits liability that cannot be limited by law.
      </p>

      <h2>15. Governing law</h2>
      <p>
        These terms are governed by the laws of the State of Oregon, USA, without regard to its conflict-of-law rules. If a
        dispute comes up, please contact us first; most problems can be sorted out quickly by email. Any legal claim must be
        brought in the state or federal courts located in Marion County, Oregon, unless the law where you live gives you the
        right to bring it elsewhere.
      </p>

      <h2>16. Changes to these terms</h2>
      <p>
        We may update these terms as ProfitSync changes. We&apos;ll update the date at the top, and for important changes we&apos;ll
        tell you by email or in the app before they take effect. If you keep using ProfitSync after that, you accept the new terms.
      </p>

      <h2>17. Contact</h2>
      <p>
        Questions about these terms? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or visit our{" "}
        <Link href="/contact">contact page</Link>.
      </p>
    </LegalPage>
  );
}
