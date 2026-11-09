import { NextResponse } from "next/server";
import {
  getAllStoredCustomers,
  upsertCustomerInStore,
} from "@/lib/server-store";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";

export async function GET() {
  try {
    const snap = await getDocs(collection(db, "users"));
    const customers = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: data.uid || d.id,
          name: data.name || "Customer",
          phone: data.phone || "",
          email: data.email || "",
          city: data.city || "",
          createdAt: Number(data.createdAt) || 0,
          lastLoginAt: Number(data.lastLoginAt) || Number(data.createdAt) || 0,
        };
      })
      .sort((a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0));
    return NextResponse.json({ success: true, customers });
  } catch (err) {
    console.warn("Firestore customers GET fallback to local store:", err);
    const customers = getAllStoredCustomers();
    return NextResponse.json({ success: true, customers });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, phone, email, city } = body;

    if (!phone) {
      return NextResponse.json(
        { success: false, error: "Phone number is required." },
        { status: 400 }
      );
    }

    const customer = upsertCustomerInStore({
      name: name || "Customer",
      phone,
      email,
      city,
    });

    try {
      await setDoc(
        doc(db, "users", customer.id),
        {
          uid: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email || "",
          city: customer.city || "",
          role: "customer",
          createdAt: customer.createdAt,
          lastLoginAt: customer.lastLoginAt,
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("Firestore customer sync notice:", e);
    }

    return NextResponse.json({ success: true, customer });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save customer";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
