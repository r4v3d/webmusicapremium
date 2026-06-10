import { NextResponse } from "next/server";

// Initialize a global store in Node.js to persist orders during runtime
global.ordersDb = global.ordersDb || {};

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      service,
      planId,
      duration,
      pricePen,
      priceUsd,
      fullName,
      email,
      whatsapp,
      paymentMethod,
    } = body;

    // Basic Validation
    if (!service || !planId || !fullName || !email || !whatsapp || !paymentMethod) {
      return NextResponse.json(
        { message: "Faltan campos requeridos en el formulario." },
        { status: 400 }
      );
    }

    // Generate unique order ID: MPB-XXXX
    const orderId = `MPB-${Math.floor(100000 + Math.random() * 900000)}`;

    // Create Order Object
    const newOrder = {
      orderId,
      service,
      planId,
      duration,
      pricePen,
      priceUsd,
      fullName,
      email,
      whatsapp,
      paymentMethod,
      status: "pending", // pending, paid, expired, failed
      createdAt: new Date().toISOString(),
    };

    // Store in global object
    global.ordersDb[orderId] = newOrder;

    return NextResponse.json(
      { orderId, message: "Pedido creado con éxito." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Order Creation Error:", error);
    return NextResponse.json(
      { message: "Error interno al crear el pedido." },
      { status: 500 }
    );
  }
}
