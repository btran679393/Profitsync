
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/prisma/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const environment =
      process.env.EBAY_ENVIRONMENT === "PRODUCTION"
        ? "PRODUCTION"
        : "SANDBOX";

    const connections =
      await db.orm.public.EbayConnection.where({
        userId: user.id,
        environment,
      }).all();

    const connection = connections.find(
      (item) => Boolean(item.ebayUserId)
    );

    if (!connection) {
      return NextResponse.json(
        { error: "No connected eBay account." },
        { status: 401 }
      );
    }

    if (
      new Date(connection.accessTokenExpiresAt).getTime() <=
      Date.now() + 60000
    ) {
      return NextResponse.json(
        {
          error: "Access token expired.",
          message:
            "Reconnect eBay before running this test.",
        },
        { status: 401 }
      );
    }

    const apiBase =
      environment === "PRODUCTION"
        ? "https://apiz.ebay.com"
        : "https://apiz.sandbox.ebay.com";

    const params = new URLSearchParams({
      filter: "transactionType:{SALE}",
      limit: "1",
    });

    const response = await fetch(
      `${apiBase}/sell/finances/v1/transaction?${params}`,
      {
        headers: {
          Authorization:
            `Bearer ${connection.accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (response.status === 204) {
      return NextResponse.json({
        success: true,
        message: "Finances API accessible; no transactions returned.",
        transactionsFound: 0,
      });
    }

    const raw = await response.text();

    if (!response.ok) {
      console.error("eBay Finances API test failed:", {
        status: response.status,
        response: raw.slice(0, 1000),
      });

      return NextResponse.json(
        {
          success: false,
          status: response.status,
          error: "Finances API request failed.",
        },
        { status: 502 }
      );
    }

    const data = JSON.parse(raw);

    const transaction = data.transactions?.[0];

    // Return only fee-related information.
    // Do not expose tokens, buyer information,
    // order identifiers, or complete transaction data.
    return NextResponse.json({
      success: true,
      status: response.status,
      transactionsFound: data.total ?? 0,
      sample: transaction
        ? {
            transactionType: transaction.transactionType,
            hasTotalFeeAmount:
              transaction.totalFeeAmount !== undefined,
            totalFeeAmount:
              transaction.totalFeeAmount ?? null,
            hasOrderLineItems:
              Array.isArray(transaction.orderLineItems),
            feeFieldNames: Object.keys(transaction).filter(
              (key) => key.toLowerCase().includes("fee")
            ),
            lineItemFeeFieldNames:
              transaction.orderLineItems?.[0]
                ? Object.keys(
                    transaction.orderLineItems[0]
                  ).filter((key) =>
                    key.toLowerCase().includes("fee")
                  )
                : [],
          }
        : null,
    });
  } catch (error) {
    console.error("Finances test failed:", error);

    return NextResponse.json(
      { error: "Unable to test Finances API." },
      { status: 500 }
    );
  }
}
