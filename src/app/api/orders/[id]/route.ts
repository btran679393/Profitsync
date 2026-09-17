import { NextResponse } from "next/server";
import { db } from "@/prisma/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const orderId = Number(id);

    if (!Number.isInteger(orderId)) {
      return NextResponse.json(
        { error: "Invalid order ID" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const productCost = Number(body.productCost);

    if (!Number.isFinite(productCost) || productCost < 0) {
      return NextResponse.json(
        { error: "Invalid product cost" },
        { status: 400 }
      );
    }

    const updatedOrder = await db.orm.public.Order
      .where({ id: orderId })
      .update({
        productCost: productCost.toFixed(2),
        status: "COMPLETED",
      });

    return NextResponse.json(updatedOrder);
  } catch (error) {
    console.error("Failed to update order:", error);

    return NextResponse.json(
      { error: "Failed to update order" },
      { status: 500 }
    );
  }
}