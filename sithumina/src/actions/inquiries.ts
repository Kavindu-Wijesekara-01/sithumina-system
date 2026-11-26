"use server";

import { authorize } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import {
  addInquiryInStore,
  getAllStoredInquiries,
  updateInquiryStatusInStore,
  StoredInquiry,
} from "@/lib/server-store";
import { ActionResult, InquiryActionInput } from "./types";
import { db } from "@/lib/fs-server";
import { collection, doc, getDocs, setDoc } from "@/lib/fs-server";

/**
 * Server Action for sending an inquiry or requesting a rate quote.
 */
export async function submitInquiryAction(
  input: InquiryActionInput
): Promise<ActionResult<{ id: string; inquiry: StoredInquiry }>> {
  try {
    const name = input.name?.trim();
    const phone = input.phone?.trim();
    const message = input.message?.trim();
    const email = input.email?.trim() || "";
    const subject = input.subject?.trim() || (input.type ? `${input.type.toUpperCase()} Request` : "Freight Rate Inquiry");

    if (!name) {
      return { success: false, error: "Your name is required." };
    }
    if (!phone || phone.length < 8) {
      return { success: false, error: "A valid phone number is required." };
    }
    if (!message) {
      return { success: false, error: "Please enter your message or cargo details." };
    }

    const inquiry = await addInquiryInStore({
      name,
      phone,
      email,
      subject,
      message,
    });

    try {
      await setDoc(
        doc(db, "inquiries", inquiry.id),
        {
          id: inquiry.id,
          name,
          phone,
          email,
          subject,
          message,
          type: input.type || "general",
          status: "unread",
          createdAt: inquiry.createdAt,
        },
        { merge: true }
      );
    } catch (cloudErr) {
      console.warn("Firestore inquiry sync notice:", cloudErr);
    }

    try {
      revalidatePath("/contact");
      revalidatePath("/manage");
    } catch {
      // Ignored
    }

    return {
      success: true,
      data: {
        id: inquiry.id,
        inquiry,
      },
      message: "Inquiry submitted successfully.",
    };
  } catch (err: unknown) {
    console.error("submitInquiryAction error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to submit inquiry.",
    };
  }
}

/**
 * Server Action to fetch all inquiries.
 */
export async function getAllInquiriesAction(): Promise<ActionResult<StoredInquiry[]>> {
  const auth = await authorize("admin");
  if (!auth.ok) return auth.denied;
  try {
    try {
      const snap = await getDocs(collection(db, "inquiries"));
      const inquiries: StoredInquiry[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            name: String(data.name || ""),
            phone: String(data.phone || ""),
            email: data.email || "",
            subject: String(data.subject || "General Inquiry"),
            message: String(data.message || ""),
            status: (data.status as "unread" | "resolved") || "unread",
            createdAt: Number(data.createdAt) || 0,
          };
        })
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return { success: true, data: inquiries };
    } catch {
      const inquiries = await getAllStoredInquiries();
      return { success: true, data: inquiries };
    }
  } catch (err: unknown) {
    console.error("getAllInquiriesAction error:", err);
    return {
      success: false,
      error: "Failed to retrieve inquiries.",
    };
  }
}

/**
 * Server Action to mark inquiry as resolved.
 */
export async function updateInquiryStatusAction(
  id: string,
  status: "unread" | "resolved"
): Promise<ActionResult<StoredInquiry>> {
  const auth = await authorize("admin");
  if (!auth.ok) return auth.denied;
  try {
    if (!id) {
      return { success: false, error: "Inquiry ID is required." };
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
    } catch {}

    if (!updatedLocal && !firestoreOk) {
      return { success: false, error: "Inquiry not found." };
    }

    try {
      revalidatePath("/contact");
      revalidatePath("/manage");
    } catch {
      // Ignored
    }

    const result: StoredInquiry = updatedLocal || {
      id,
      name: "",
      phone: "",
      subject: "",
      message: "",
      status,
      createdAt: Date.now(),
    };

    return {
      success: true,
      data: result,
    };
  } catch (err: unknown) {
    console.error("updateInquiryStatusAction error:", err);
    return {
      success: false,
      error: "Failed to update inquiry status.",
    };
  }
}
