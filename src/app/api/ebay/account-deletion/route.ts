
import { createHash, createHmac } from "crypto";
import { Pool } from "pg";
import { NextRequest, NextResponse } from "next/server";
import { validateSignature } from "event-notification-nodejs-sdk/lib/validator";

export const runtime = "nodejs";

type EbayEnvironment = "SANDBOX" | "PRODUCTION";

type EbayDeletionNotification = {
  metadata: {
    topic: string;
  };
  notification: {
    notificationId: string;
    data: {
      userId?: string;
      username?: string;
      eiasToken?: string;
    };
  };
};

function hashIdentifier(
  identifier: string,
  identifierType: "userId" | "username",
  secret: string
): string {
  return createHmac("sha256", secret)
    .update(`${identifierType}:${identifier}`)
    .digest("hex");
}

// eBay uses GET to verify ownership of this endpoint.
export async function GET(request: NextRequest) {
  const challengeCode =
    request.nextUrl.searchParams.get("challenge_code");

  const verificationToken =
    process.env.EBAY_DELETION_VERIFICATION_TOKEN;

  const endpoint = process.env.EBAY_DELETION_ENDPOINT;

  if (!challengeCode || !verificationToken || !endpoint) {
    return NextResponse.json(
      { error: "Missing verification configuration" },
      { status: 400 }
    );
  }

  const challengeResponse = createHash("sha256")
    .update(challengeCode + verificationToken + endpoint)
    .digest("hex");

  return NextResponse.json({ challengeResponse });
}

// eBay uses POST to deliver account deletion notifications.
export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-ebay-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing eBay signature" },
      { status: 412 }
    );
  }

  // Reject malformed signatures before calling the eBay SDK.
  try {
    const decoded = JSON.parse(
      Buffer.from(signature, "base64").toString("utf8")
    );

    if (
      !decoded ||
      typeof decoded !== "object" ||
      typeof decoded.kid !== "string" ||
      !decoded.kid ||
      typeof decoded.signature !== "string" ||
      !decoded.signature
    ) {
      throw new Error("Invalid signature format");
    }
  } catch {
    return NextResponse.json(
      { error: "Malformed eBay signature" },
      { status: 412 }
    );
  }

  const rawBody = await request.text();

  if (!rawBody) {
    return NextResponse.json(
      { error: "Empty notification" },
      { status: 400 }
    );
  }

  let message: EbayDeletionNotification;

  try {
    message = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON notification" },
      { status: 400 }
    );
  }

  // IMPORTANT:
  // eBay Production sends notifications to this endpoint.
  // Use Production credentials for signature verification.
  //
  // The regular order-sync route continues using
  // EBAY_ENVIRONMENT, which remains SANDBOX for now.
  const clientId = process.env.EBAY_PRODUCTION_CLIENT_ID;
  const clientSecret = process.env.EBAY_PRODUCTION_CLIENT_SECRET;
  const hashSecret = process.env.EBAY_DELETION_HASH_SECRET;
  const databaseUrl = process.env.DATABASE_URL;

  const environment: EbayEnvironment = "PRODUCTION";

  if (!clientId || !clientSecret || !hashSecret || !databaseUrl) {
    console.error("Missing account deletion configuration.");

    return NextResponse.json(
      { error: "Account deletion configuration unavailable" },
      { status: 503 }
    );
  }

  // Verify the notification using eBay's Production public key.
  try {
    const isValid = await validateSignature(
      message,
      signature,
      {
        clientId,
        clientSecret,
        environment,
      }
    );

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid eBay notification signature" },
        { status: 412 }
      );
    }
  } catch (error) {
    console.error("eBay signature verification failed:", error);

    return NextResponse.json(
      { error: "Unable to verify notification" },
      { status: 503 }
    );
  }

  // Validate the notification structure.
  if (
    message?.metadata?.topic !== "MARKETPLACE_ACCOUNT_DELETION" ||
    typeof message?.notification?.notificationId !== "string" ||
    !message.notification.notificationId.trim() ||
    !message.notification.data ||
    typeof message.notification.data !== "object"
  ) {
    return NextResponse.json(
      { error: "Invalid account deletion notification" },
      { status: 400 }
    );
  }

  const notificationId = message.notification.notificationId;
  const data = message.notification.data;

  const ebayUserId =
    typeof data.userId === "string" && data.userId.trim()
      ? data.userId.trim()
      : null;

  const username =
    typeof data.username === "string" && data.username.trim()
      ? data.username.trim()
      : null;

  if (!ebayUserId && !username) {
    return NextResponse.json(
      { error: "Notification has no usable account identifier" },
      { status: 503 }
    );
  }

  // Prefer the immutable ID for deletion tracking.
  const trackingIdentifier = ebayUserId ?? username!;

  const trackingType: "userId" | "username" =
    ebayUserId ? "userId" : "username";

  const accountHash = hashIdentifier(
    trackingIdentifier,
    trackingType,
    hashSecret
  );

  // Hash every identifier provided by eBay.
  // Raw identifiers are not stored in the tracking table.
  const identifierHashes = Array.from(
    new Set([
      ...(ebayUserId
        ? [hashIdentifier(ebayUserId, "userId", hashSecret)]
        : []),
      ...(username
        ? [hashIdentifier(username, "username", hashSecret)]
        : []),
    ])
  );

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10000,
  });

  let client;

  try {
    client = await pool.connect();

    await client.query("BEGIN");

    // Lock every identifier in a consistent order.
    // The sync route uses matching locks to prevent
    // deleted orders from being reimported.
    for (const identifierHash of [...identifierHashes].sort()) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        [`${environment}:${identifierHash}`]
      );
    }

    // Check whether this notification was already processed.
    const existingEvent = await client.query(
      `
      SELECT id
      FROM public."ebayDeletionEvent"
      WHERE "notificationId" = $1
        AND environment = $2
      LIMIT 1
      `,
      [notificationId, environment]
    );

    if (existingEvent.rowCount && existingEvent.rowCount > 0) {
      await client.query("COMMIT");

      return new NextResponse(null, { status: 204 });
    }

    // Collect both identifiers supplied by eBay.
    // Username and immutable user ID may be different.
    const identifiers = Array.from(
      new Set(
        [ebayUserId, username].filter(
          (value): value is string => Boolean(value)
        )
      )
    );

    // Delete orders where the deleted account is the buyer.
    const buyerDeletion = await client.query(
      `
      DELETE FROM public."order"
      WHERE environment = $1
        AND "ebayBuyerId" = ANY($2::text[])
      `,
      [environment, identifiers]
    );

    // Delete orders where the deleted account is the seller.
    const sellerDeletion = await client.query(
      `
      DELETE FROM public."order"
      WHERE environment = $1
        AND "ebayUserId" = ANY($2::text[])
      `,
      [environment, identifiers]
    );

    // Disconnect the deleted seller account.
    const connectionDeletion = await client.query(
      `
      DELETE FROM public."ebayConnection"
      WHERE environment = $1
        AND "ebayUserId" = ANY($2::text[])
      `,
      [environment, identifiers]
    );

    // Record the deleted account without its raw identifier.
    await client.query(
      `
      INSERT INTO public."ebayDeletedAccount" (
        environment,
        "accountHash"
      )
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [environment, accountHash]
    );

    // Save identifier hashes for future import protection.
    for (const identifierHash of identifierHashes) {
      await client.query(
        `
        INSERT INTO public."ebayDeletedIdentifier" (
          environment,
          "identifierHash"
        )
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        `,
        [environment, identifierHash]
      );
    }

    // Record the processed notification.
    await client.query(
      `
      INSERT INTO public."ebayDeletionEvent" (
        "notificationId",
        environment
      )
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [notificationId, environment]
    );

    await client.query("COMMIT");

    console.log("eBay account deletion processed.", {
      environment,
      buyerOrdersDeleted: buyerDeletion.rowCount,
      sellerOrdersDeleted: sellerDeletion.rowCount,
      connectionsDeleted: connectionDeletion.rowCount,
      identifierHashesRecorded: identifierHashes.length,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Account deletion rollback failed:",
          rollbackError
        );
      }
    }

    console.error(
      "eBay account deletion processing failed:",
      error
    );

    return NextResponse.json(
      { error: "Unable to process account deletion" },
      { status: 503 }
    );
  } finally {
    client?.release();
    await pool.end();
  }
}
