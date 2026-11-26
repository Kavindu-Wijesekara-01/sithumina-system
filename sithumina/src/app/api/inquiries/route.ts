import { NextResponse } from "next/server";
import {
  getAllStoredInquiries,
  addInquiryInStore,
  updateInquiryStatusInStore,
} from "@/lib/server-store";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";

export async function GET() {
  try {
    const snap = await getDocs(collection(db, "inquiries"));
    const inquiries = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: data.id || d.id,
          name: data.name || "",
          phone: data.phone || "",
          email: data.email || "",
          subject: data.subject || "General Inquiry",
          message: data.message || "",
          status: data.status || "unread",
          createdAt: Number(data.createdAt) || 0,
        };
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return NextResponse.json({ success: true, inquiries });
  } catch (err) {
    console.warn("Firestore inquiries GET fallback to local store:", err);
    const inquiries = await getAllStoredInquiries();
    return NextResponse.json({ success: true, inquiries });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, phone, email, subject, message } = body;

    if (!name || !phone || !message) {
      return NextResponse.json(
        { success: false, error: "Name, phone, and message are required." },
        { status: 400 }
      );
    }

    const inquiry = await addInquiryInStore({
      name,
      phone,
      email,
      subject: subject || "General Inquiry",
      message,
    });

    try {
      await setDoc(doc(db, "inquiries", inquiry.id), inquiry, { merge: true });
    } catch (e) {
      console.warn("Firestore sync notice for inquiry POST:", e);
    }

    return NextResponse.json({ success: true, inquiry });
  } catch (error: unknown) {
    const errMessage =
      error instanceof Error ? error.message : "Failed to submit inquiry";
    return NextResponse.json({ success: false, error: errMessage }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Inquiry ID and status are required." },
        { status: 400 }
      );
    }

    const updatedLocal = await updateInquiryStatusInStore(id, status);
    let firestoreOk = false;
    try {
      await setDoc(
        doc(db, "inquiries", id),
        { id, status, updatedAt: Date.now() },
        { merge: true }
      );
      firestoreOk = true;
    } catch (e) {
      console.warn("Firestore sync notice for inquiry PATCH:", e);
    }

    if (!updatedLocal && !firestoreOk) {
      return NextResponse.json(
        { success: false, error: "Inquiry not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, inquiry: updatedLocal || { id, status } });
  } catch (error: unknown) {
    const errMessage =
      error instanceof Error ? error.message : "Failed to update inquiry";
    return NextResponse.json({ success: false, error: errMessage }, { status: 500 });
  }
}
