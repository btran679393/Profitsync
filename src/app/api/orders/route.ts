import { NextResponse } from "next/server";
import { db } from "@/prisma/db";

export async function GET() {
  const orders = await db.orm.public.Order.all();

  return NextResponse.json(orders);
}

export async function POST() {
  const existingOrders = await db.orm.public.Order.all();

  if (existingOrders.length > 0) {
    return NextResponse.json({
      message: "Sample orders already exist.",
      orders: existingOrders,
    });
  }

  const orders = await db.orm.public.Order.createAll([
    {
      ebayOrderId: "SAMPLE-001",
      item: "Real Madrid Ronaldo #7 Jersey",
      salePrice: 54.99,
      ebayFees: 8.17,
      productCost: 18.0,
      status: "COMPLETED",
    },
    {
      ebayOrderId: "SAMPLE-002",
      item: "Barcelona Messi #10 Jersey",
      salePrice: 49.99,
      ebayFees: 7.42,
      productCost: 17.5,
      status: "COMPLETED",
    },
    {
      ebayOrderId: "SAMPLE-003",
      item: "Arsenal Henry #14 Jersey",
      salePrice: 59.99,
      ebayFees: 8.85,
      productCost: null,
      status: "COST_NEEDED",
    },
  ]);

  return NextResponse.json(orders, { status: 201 });
}