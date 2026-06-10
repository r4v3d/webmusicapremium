import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { getStock, addStockItems, deleteStockItem } from "../../../../lib/db";

export async function GET() {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const stock = await getStock();
    return NextResponse.json(stock, { status: 200 });
  } catch (error) {
    console.error("Fetch Stock Error:", error);
    return NextResponse.json({ message: `Error al cargar el stock: ${error.message}` }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const body = await req.json();
    const { service, rawInput } = body;

    if (!service || !rawInput) {
      return NextResponse.json({ message: "Plataforma e información de entrada son requeridos." }, { status: 400 });
    }

    // Split input into lines
    const lines = rawInput.split(/\r?\n/);
    const newItems = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return; // Skip empty lines

      let accountData = "";
      
      // Attempt to split by tab (pasted from Google Sheets), comma, semicolon, or colon
      const parts = trimmed.split(/\t|,|;|:/);
      
      if (parts.length >= 2) {
        // Extract first two columns (e.g. Email and Password)
        const col1 = parts[0].trim();
        const col2 = parts[1].trim();
        accountData = `${col1}:${col2}`;
      } else {
        // Fallback for single value code/key
        accountData = trimmed;
      }

      if (accountData) {
        newItems.push({
          id: `STK-${Math.floor(100000 + Math.random() * 900000)}`,
          service,
          accountData,
          isUsed: false,
          assignedToOrder: null,
          createdAt: new Date().toISOString()
        });
      }
    });

    if (newItems.length === 0) {
      return NextResponse.json({ message: "No se encontraron cuentas válidas para importar." }, { status: 400 });
    }

    // Save to DB
    await addStockItems(newItems);

    return NextResponse.json({
      success: true,
      count: newItems.length,
      message: `Se importaron con éxito ${newItems.length} cuentas de ${service.toUpperCase()}.`
    }, { status: 201 });

  } catch (error) {
    console.error("Import Stock Error:", error);
    return NextResponse.json({ message: `Error al importar stock: ${error.message}` }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ message: "ID de stock requerido." }, { status: 400 });
    }

    await deleteStockItem(id);
    return NextResponse.json({ success: true, message: "Cuenta de stock eliminada." }, { status: 200 });
  } catch (error) {
    console.error("Delete Stock Error:", error);
    return NextResponse.json({ message: `Error al eliminar la cuenta de stock: ${error.message}` }, { status: 500 });
  }
}
