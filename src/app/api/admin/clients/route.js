import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { getClients, searchClients } from "../../../../lib/db";

export async function GET(req) {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query");

    let list = [];
    if (query && query.trim()) {
      list = await searchClients(query);
    } else {
      list = await getClients();
    }

    return NextResponse.json(list, { status: 200 });
  } catch (error) {
    console.error("Fetch Clients Error:", error);
    return NextResponse.json({ message: `Error al cargar clientes: ${error.message}` }, { status: 500 });
  }
}
