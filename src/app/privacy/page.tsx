
export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "48px 24px",
        fontFamily: "Arial, sans-serif",
        lineHeight: 1.7,
        color: "#f3f4f6",
      }}
    >
      <a href="/" style={{ color: "#60a5fa" }}>
        ← Back to ProfitSync
      </a>

      <h1 style={{ marginTop: "32px" }}>
        ProfitSync Privacy Policy
      </h1>

      <p>
        <strong>Last updated:</strong> October 19, 2026
      </p>

      <p>
        ProfitSync is an application designed to help eBay
        sellers track their sales, expenses, and estimated
        profits. This Privacy Policy explains how information
        is collected, used, and stored when you use ProfitSync.
      </p>

      <h2>1. Information We Collect</h2>

      <p>
        When you sign in using Google, ProfitSync may receive
        your name, email address, and account identifier.
      </p>

      <p>
        If you connect an eBay account, ProfitSync may access
        your eBay seller identifier, order details, item
        titles, transaction amounts, and other information
        authorized through eBay.
      </p>

      <p>
        ProfitSync also stores product costs that you enter
        manually.
      </p>

      <h2>2. How We Use Information</h2>

      <p>
        ProfitSync uses this information to display sales,
        calculate estimated profits, track expenses, and
        associate orders with the correct user account.
      </p>

      <p>
        ProfitSync does not use its current eBay read-only
        permissions to modify listings, cancel orders, or
        issue refunds.
      </p>

      <h2>3. Account Connections</h2>

      <p>
        Connecting an eBay account requires your authorization.
        ProfitSync stores access and refresh tokens to retrieve
        permitted account information. You may revoke
        ProfitSync's authorization through your eBay account
        settings.
      </p>

      <h2>4. Data Storage and Security</h2>

      <p>
        ProfitSync uses authentication and database services
        to store application data and associate information
        with individual accounts.
      </p>

      <p>
        We use reasonable technical safeguards to protect
        stored information. However, no online system can
        guarantee absolute security.
      </p>

      <h2>5. Third-Party Services</h2>

      <p>
        ProfitSync uses services including Google for sign-in,
        eBay for authorized seller information, Supabase for
        authentication and database storage, and Vercel for
        application hosting.
      </p>

      <p>
        These services may process information according to
        their own privacy policies.
      </p>

      <h2>6. Data Retention and Deletion</h2>

      <p>
        Account information and order records may be retained
        while they are needed to provide ProfitSync services.
      </p>

      <p>
        Users may request account disconnection or deletion
        of their stored information by contacting ProfitSync
        at the email address below.
      </p>

      <h2>7. Changes to This Policy</h2>

      <p>
        This Privacy Policy may be updated when ProfitSync
        changes its features, data practices, or service
        providers.
      </p>

      <h2>8. Contact</h2>

      <p>
        For questions about this Privacy Policy, account
        information, or data deletion requests, contact
        ProfitSync at{" "}
        <a
          href="mailto:brandontran391@gmail.com"
          style={{ color: "#60a5fa" }}
        >
          brandontran391@gmail.com
        </a>
        .
      </p>
    </main>
  );
}
