import { NextResponse } from "next/server";

// Reference global database
global.ordersDb = global.ordersDb || {};

export async function GET(req, { params }) {
  try {
    const { orderId } = await params;
    const order = global.ordersDb[orderId];

    if (!order) {
      return NextResponse.json(
        { message: "El pedido no fue encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json(order, { status: 200 });
  } catch (error) {
    console.error("Fetch Order Error:", error);
    return NextResponse.json(
      { message: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

// POST endpoint to update status (simulated webhook/update)
export async function POST(req, { params }) {
  try {
    const { orderId } = await params;
    const order = global.ordersDb[orderId];

    if (!order) {
      return NextResponse.json(
        { message: "El pedido no fue encontrado." },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { status } = body;

    if (!status || !["pending", "paid", "expired", "failed"].includes(status)) {
      return NextResponse.json(
        { message: "Estado de pago inválido." },
        { status: 400 }
      );
    }

    // Update order status in memory
    global.ordersDb[orderId].status = status;
    global.ordersDb[orderId].updatedAt = new Date().toISOString();

    return NextResponse.json(
      { message: `Estado del pedido actualizado a ${status}.`, order: global.ordersDb[orderId] },
      { status: 200 }
    );
  } catch (error) {
    console.error("Update Order Error:", error);
    return NextResponse.json(
      { message: "Error interno del servidor al actualizar el pedido." },
      { status: 500 }
    );
  }
}
