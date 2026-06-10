import { NextResponse } from "next/server";
import { getOrderById, updateOrder, assignStockAccount } from "../../../../lib/db";
import { sendOrderEmail } from "../../../../lib/email";

export async function GET(req, { params }) {
  try {
    const { orderId } = await params;
    const order = await getOrderById(orderId);

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

// POST endpoint to update status (simulated checkout / admin approval)
export async function POST(req, { params }) {
  try {
    const { orderId } = await params;
    const order = await getOrderById(orderId);

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

    const updatedFields = { status };

    // If status is changing to 'paid', auto-assign a stock account if available
    if (status === "paid" && order.status !== "paid") {
      const assigned = await assignStockAccount(orderId, order.service);
      if (assigned) {
        updatedFields.assignedAccount = assigned;
      }
    }

    const updatedOrder = await updateOrder(orderId, updatedFields);

    // If order was successfully paid, trigger email notification asynchronously
    if (status === "paid" && order.status !== "paid" && updatedOrder) {
      sendOrderEmail(updatedOrder).catch(err => console.error("Async email send error:", err));
    }

    return NextResponse.json(
      { message: `Estado del pedido actualizado a ${status}.`, order: updatedOrder },
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
