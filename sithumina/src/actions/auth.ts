"use server";

import { authorize } from "@/lib/auth/server";
import {
  upsertCustomerInStore,
  deleteCustomerFromStore,
  archiveCustomerBookingsInStore,
  getAllStoredCustomers,
  getAllStoredDrivers,
  StoredCustomer,
  StoredDriver,
} from "@/lib/server-store";
import { normalizePhoneNumber, phonesMatch, getCanonicalCustomerId } from "@/lib/phone-utils";
import { ActionResult } from "./types";
import { db } from "@/lib/fs-server";
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from "@/lib/fs-server";

async function fetchDriversAuthoritative(): Promise<StoredDriver[]> {
  try {
    const snap = await getDocs(collection(db, "drivers"));
    const list: StoredDriver[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        driverId: String(data.driverId || d.id),
        name: String(data.name || ""),
        phone: String(data.phone || ""),
        plate: String(data.plate || ""),
        vehicleType: String(data.vehicleType || ""),
        route: String(data.route || ""),
        lorryId: String(data.lorryId || ""),
        active: data.active !== false,
        createdAt: Number(data.createdAt) || 0,
      };
    });
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return list;
  } catch {
    return await getAllStoredDrivers();
  }
}

/**
 * Server Action to register/save a customer profile cleanly (e.g. from Admin Manual Booking).
 */
export async function registerCustomerAction(input: {
  phone: string;
  name: string;
  idNumber?: string;
  city?: string;
  email?: string;
}): Promise<ActionResult<StoredCustomer>> {
  const auth = await authorize("admin");
  if (!auth.ok) return auth.denied;
  try {
    const rawPhone = String(input.phone || "").trim();
    const canonicalPhone = normalizePhoneNumber(rawPhone);
    const digitsOnly = canonicalPhone.replace(/[^0-9]/g, "");
    if (!canonicalPhone || digitsOnly.length < 9) {
      return { success: false, error: "Please enter a valid customer mobile number." };
    }

    const cleanName = String(input.name || "").trim();
    if (!cleanName || cleanName.length < 2) {
      return { success: false, error: "Please enter the customer's full name to register." };
    }

    const customer = await upsertCustomerInStore({
      phone: canonicalPhone,
      name: cleanName,
      idNumber: input.idNumber?.trim(),
      city: input.city?.trim(),
      email: input.email?.trim(),
    });

    try {
      await setDoc(
        doc(db, "users", customer.id),
        {
          uid: customer.id,
          phone: customer.phone,
          name: customer.name,
          email: customer.email || "",
          city: customer.city || "",
          idNumber: customer.idNumber || input.idNumber?.trim() || "",
          role: "customer",
          createdAt: customer.createdAt,
          lastLoginAt: customer.lastLoginAt,
        },
        { merge: true }
      );
    } catch (cloudErr) {
      console.warn("Customer Firestore sync notice:", cloudErr);
    }

    return {
      success: true,
      data: customer,
    };
  } catch (err: unknown) {
    console.error("registerCustomerAction error:", err);
    return {
      success: false,
      error: "Failed to register customer.",
    };
  }
}

/**
 * Server Action for Admin to delete a customer profile (and optionally their bookings).
 */
export async function deleteCustomerAction(input: {
  customerId: string;
  phone?: string;
  deleteBookings?: boolean;
}): Promise<ActionResult<{ deletedUserDocs: number; affectedBookings: number }>> {
  const auth = await authorize("admin");
  if (!auth.ok) return auth.denied;
  try {
    const cleanId = String(input.customerId || "").trim();
    const cleanPhone = String(input.phone || "").trim();
    const deleteBookings = Boolean(input.deleteBookings);

    if (!cleanId && !cleanPhone) {
      return { success: false, error: "Customer ID or phone number is required." };
    }

    // 1. Remove the customer record
    const removedLocal = await deleteCustomerFromStore(cleanId, cleanPhone);
    let deletedUserDocs = removedLocal ? 1 : 0;
    let affectedBookings = cleanPhone
      ? await archiveCustomerBookingsInStore(cleanPhone)
      : 0;

    // 2. Remove matching customer document(s) from Firestore "users" collection
    try {
      const candidateIds = new Set<string>();
      if (cleanId) candidateIds.add(cleanId);
      if (cleanPhone) {
        const canonicalId = getCanonicalCustomerId(cleanPhone);
        if (canonicalId) candidateIds.add(canonicalId);
      }

      const usersSnap = await getDocs(collection(db, "users"));
      const deletedDocIds = new Set<string>();

      for (const userDoc of usersSnap.docs) {
        const data = userDoc.data();
        if (data.role === "driver" || data.role === "admin") continue;
        const docPhone = String(data.phone || "").trim();
        const matchesId =
          candidateIds.has(userDoc.id) ||
          (data.uid && candidateIds.has(String(data.uid)));
        const matchesPhone = Boolean(cleanPhone && docPhone && phonesMatch(docPhone, cleanPhone));

        if (matchesId || matchesPhone) {
          await deleteDoc(doc(db, "users", userDoc.id));
          deletedDocIds.add(userDoc.id);
          deletedUserDocs += 1;
        }
      }

      // Direct delete safeguard if any candidate ID wasn't seen above
      for (const cid of candidateIds) {
        if (!deletedDocIds.has(cid) && cid.startsWith("CUST-")) {
          try {
            await deleteDoc(doc(db, "users", cid));
          } catch {
            // Ignore non-existent IDs
          }
        }
      }

      // 3. Either delete or archive customer directory link on existing bookings
      if (cleanPhone) {
        const bookingsSnap = await getDocs(collection(db, "bookings"));
        const nowTs = Date.now();
        for (const bDoc of bookingsSnap.docs) {
          const bData = bDoc.data();
          const bPhone = String(bData.customerPhone || bData.phone || "").trim();
          if (!bPhone || !phonesMatch(bPhone, cleanPhone)) continue;

          await updateDoc(doc(db, "bookings", bDoc.id), {
            customerArchived: true,
            updatedAt: nowTs,
          });
          affectedBookings += 1;
        }
      }
    } catch (cloudErr) {
      console.warn("Customer Firestore delete sync notice:", cloudErr);
    }

    return {
      success: true,
      data: {
        deletedUserDocs,
        affectedBookings,
      },
    };
  } catch (err: unknown) {
    console.error("deleteCustomerAction error:", err);
    return {
      success: false,
      error: "Failed to delete customer.",
    };
  }
}

/**
 * Server Action to get all registered customers (merged Firestore + local store).
 */
export async function getCustomersAction(): Promise<ActionResult<StoredCustomer[]>> {
  const auth = await authorize("admin");
  if (!auth.ok) return auth.denied;
  try {
    const localCustomers = await getAllStoredCustomers();
    const byKey = new Map<string, StoredCustomer>();

    const isGeneric = (val?: string) => {
      const t = String(val || "").trim();
      return !t || t === "Customer" || t === "Valued Customer" || t.startsWith("Customer (");
    };

    const mergeEntry = (entry: StoredCustomer) => {
      const norm = normalizePhoneNumber(entry.phone) || entry.phone.trim();
      const key = norm || entry.id;
      if (!key) return;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, entry);
        return;
      }
      const resolvedName = !isGeneric(entry.name)
        ? entry.name.trim()
        : !isGeneric(prev.name)
        ? prev.name.trim()
        : entry.name || prev.name;
      byKey.set(key, {
        ...prev,
        ...entry,
        name: resolvedName,
        phone: prev.phone || entry.phone,
        email: entry.email || prev.email || "",
        city: entry.city || prev.city || "",
        idNumber: entry.idNumber || prev.idNumber || "",
        createdAt:
          prev.createdAt && entry.createdAt
            ? Math.min(prev.createdAt, entry.createdAt)
            : prev.createdAt || entry.createdAt,
        lastLoginAt: Math.max(prev.lastLoginAt || 0, entry.lastLoginAt || 0),
      });
    };

    localCustomers.forEach(mergeEntry);

    try {
      const snap = await getDocs(collection(db, "users"));
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.role === "driver" || data.role === "admin") return;
        mergeEntry({
          id: String(data.uid || d.id),
          name: String(data.name || "Customer"),
          phone: String(data.phone || ""),
          email: data.email || "",
          city: data.city || "",
          idNumber: String(data.idNumber || data.nic || "").trim(),
          createdAt: Number(data.createdAt) || 0,
          lastLoginAt: Number(data.lastLoginAt) || Number(data.createdAt) || 0,
        });
      });
    } catch {
      // Fallback to local store when Firestore is unavailable
    }

    const merged = Array.from(byKey.values()).sort(
      (a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0)
    );
    return { success: true, data: merged };
  } catch (err: unknown) {
    console.error("getCustomersAction error:", err);
    return {
      success: false,
      error: "Failed to fetch customers.",
    };
  }
}

/**
 * Server Action to get all registered drivers.
 */
export async function getDriversAction(): Promise<ActionResult<StoredDriver[]>> {
  const auth = await authorize("admin");
  if (!auth.ok) return auth.denied;
  try {
    const drivers = await fetchDriversAuthoritative();
    return {
      success: true,
      data: drivers,
    };
  } catch (err: unknown) {
    console.error("getDriversAction error:", err);
    return {
      success: false,
      error: "Failed to fetch drivers.",
    };
  }
}
