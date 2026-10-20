
import { NextResponse } from "next/server";
import { db } from "@/prisma/db";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Identify the signed-in user.
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    // Validate the order ID.
    const { id } = await params;
    const orderId = Number(id);

    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        { error: "Invalid order ID." },
        { status: 400 }
      );
    }

    // Validate the product cost.
    const body = await request.json();
    const productCost = Number(body.productCost);

    if (!Number.isFinite(productCost) || productCost < 0) {
      return NextResponse.json(
        { error: "Invalid product cost." },
        { status: 400 }
      );
    }

    // Update only an order belonging to the signed-in user.
    const updatedOrder = await db.orm.public.Order
      .where({
        id: orderId,
        userId: user.id,
      })
      .update({
        productCost: productCost.toFixed(2),
        status: "COMPLETED",
      });

    return NextResponse.json(updatedOrder);
  } catch (error) {
    console.error("Failed to update order:", error);

    return NextResponse.json(
      { error: "Failed to update order." },
      { status: 500 }
    );
  }
}
