
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

// eBay uses GET to verify that we own this endpoint.
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
  try {
    const rawBody = await request.text();

    if (!rawBody) {
      return NextResponse.json(
        { error: "Empty notification" },
        { status: 400 }
      );
    }

    // Do not acknowledge an unverified notification.
    // eBay's signature verification must be implemented
    // before processing or acknowledging deletion events.
    console.log("eBay deletion notification received.");

    return NextResponse.json(
      {
        error: "Notification signature verification not configured",
      },
      { status: 503 }
    );
  } catch (error) {
    console.error("eBay notification error:", error);

    return NextResponse.json(
      { error: "Unable to process notification" },
      { status: 500 }
    );
  }
}
