
import { NextResponse } from "next/server";
import { db } from "@/prisma/db";

export async function GET() {
  try {
    // Retrieve saved orders from Supabase.
    const orders = await db.orm.public.Order.all();

    // Return orders in the format expected by the dashboard.
    return NextResponse.json(orders);
  } catch (error) {
    console.error("Failed to load orders:", error);

    return NextResponse.json(
      { error: "Failed to retrieve orders." },
      { status: 500 }
    );
  }
}
