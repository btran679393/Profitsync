
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const challengeCode =
    request.nextUrl.searchParams.get("challenge_code");

  const verificationToken =
    process.env.EBAY_DELETION_VERIFICATION_TOKEN;

  const endpoint =
    process.env.EBAY_DELETION_ENDPOINT;

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
