import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../lib/auth";
import mongoose from "mongoose";
import { initDb } from "../../../../lib/db";

export async function GET(req) {
  try {
    const isAuth = await checkAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ message: "No autorizado." }, { status: 401 });
    }

    await initDb();
    
    let rawAccounts = [];
    let connectionState = mongoose.connection.readyState;
    
    const { searchParams } = new URL(req.url);
    const cleanEmail = searchParams.get("cleanEmail");
    let cleanedResult = null;

    if (mongoose.connection.readyState >= 1) {
      const colAccounts = mongoose.connection.db.collection("familyaccounts");
      const colProfiles = mongoose.connection.db.collection("memberprofiles");

      if (cleanEmail) {
        // Find and delete the matching email to resolve index locks
        const doc = await colAccounts.findOne({ masterEmail: cleanEmail.trim() });
        if (doc) {
          await colAccounts.deleteOne({ _id: doc._id });
          await colProfiles.deleteMany({ familyAccountId: doc._id });
          cleanedResult = { email: cleanEmail, id: doc._id, deleted: true };
        } else {
          cleanedResult = { email: cleanEmail, deleted: false, reason: "No se encontró ningún registro con este correo" };
        }
      }

      rawAccounts = await colAccounts.find().toArray();
    }

    return NextResponse.json({
      connectionState,
      cleanedResult,
      rawAccountsCount: rawAccounts.length,
      rawAccounts
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
