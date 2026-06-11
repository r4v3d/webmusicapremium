import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import { supabase } from "../../../../lib/db";

export async function GET(req) {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const cleanEmail = searchParams.get("cleanEmail");
    let cleanedResult = null;

    if (cleanEmail) {
      // Find the account first
      const { data: doc } = await supabase
        .from("platform_accounts")
        .select("id")
        .eq("account_email", cleanEmail.trim())
        .maybeSingle();

      if (doc) {
        // Delete the family account (ON DELETE CASCADE will clear slots)
        const { error } = await supabase
          .from("platform_accounts")
          .delete()
          .eq("id", doc.id);

        if (error) throw error;
        cleanedResult = { email: cleanEmail, id: doc.id, deleted: true };
      } else {
        cleanedResult = { email: cleanEmail, deleted: false, reason: "No se encontró ningún registro con este correo en Supabase" };
      }
    }

    // Query all family accounts to list
    const { data: rawAccounts } = await supabase
      .from("platform_accounts")
      .select("*");

    return NextResponse.json({
      connectionState: "Supabase Connected",
      cleanedResult,
      rawAccountsCount: (rawAccounts || []).length,
      rawAccounts: rawAccounts || []
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
