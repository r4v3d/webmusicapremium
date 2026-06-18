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

    // Inspect PostgREST OpenAPI schema to see actual columns
    let openApiSchema = null;
    let schemaError = null;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    
    try {
      if (supabaseUrl && supabaseKey) {
        const cleanUrl = supabaseUrl.replace(/^['"]|['"]$/g, "").trim();
        const cleanKey = supabaseKey.replace(/^['"]|['"]$/g, "").trim();
        
        const response = await fetch(`${cleanUrl}/rest/v1/platform_accounts`, {
          method: "OPTIONS",
          headers: {
            "apikey": cleanKey,
            "Authorization": `Bearer ${cleanKey}`
          }
        });
        
        if (response.ok) {
          openApiSchema = await response.json();
        } else {
          schemaError = `HTTP Status ${response.status}: ${await response.text()}`;
        }
      } else {
        schemaError = "Supabase URL or Key missing in env";
      }
    } catch (e) {
      schemaError = e.message;
    }

    // Mask service key
    const maskedKey = supabaseKey 
      ? `${supabaseKey.substring(0, 8)}...${supabaseKey.substring(supabaseKey.length - 8)}`
      : "not defined";

    // Extract columns from openApiSchema if available
    let recognizedColumns = [];
    if (openApiSchema && openApiSchema.definitions && openApiSchema.definitions.platform_accounts) {
      recognizedColumns = Object.keys(openApiSchema.definitions.platform_accounts.properties || {});
    }

    // Query all family accounts to list (safely)
    let rawAccounts = [];
    let queryError = null;
    try {
      const { data, error } = await supabase
        .from("platform_accounts")
        .select("*");
      if (error) {
        queryError = error.message;
      } else {
        rawAccounts = data || [];
      }
    } catch (e) {
      queryError = e.message;
    }

    // Query events log
    let recentEvents = [];
    try {
      const { data, error } = await supabase
        .from("events_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (!error) {
        recentEvents = data || [];
      }
    } catch (e) {}

    return NextResponse.json({
      connectionState: "Supabase Connected",
      supabaseUrl: supabaseUrl || "not defined",
      maskedServiceKey: maskedKey,
      recognizedColumns,
      schemaError,
      queryError,
      cleanedResult,
      rawAccountsCount: rawAccounts.length,
      rawAccounts: rawAccounts,
      recentEvents
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

