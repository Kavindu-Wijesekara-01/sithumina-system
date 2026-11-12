"use server";

import {
  upsertCustomerInStore,
  deleteCustomerFromStore,
  archiveOrDeleteCustomerBookingsInStore,
  getAllStoredCustomers,
  getAllStoredDrivers,
  StoredCustomer,
  StoredDriver,
} from "@/lib/server-store";
import { normalizePhoneNumber, phonesMatch, getCanonicalCustomerId } from "@/lib/phone-utils";
import { ActionResult } from "./types";
import { db } from "@/lib/firebase";
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";

/**
 * Server Action for Customer login or instant profile provisioning.
 */
export async function loginCustomerAction(
  phone: string,
  name?: string
): Promise<ActionResult<StoredCustomer>> {
  try {
    const rawPhone = phone?.trim();
    const canonicalPhone = normalizePhoneNumber(rawPhone);
    if (!canonicalPhone || canonicalPhone.length < 8) {
      return { success: false, error: "Please enter a valid phone number." };
    }

    const cleanInputName = name?.trim();
    const isGenericName =
      !cleanInputName ||
      cleanInputName === "Valued Customer" ||
      cleanInputName === "Customer";

    // Preserve existing stored customer name from users or bookings when logging in with phone only
    const isRealName = (n?: string) => {
      const t = String(n || "").trim();
      return Boolean(t && t !== "Valued Customer" && t !== "Customer" && !t.startsWith("Customer ("));
    };

    let matchedExistingName = "";
    const existingCustomers = getAllStoredCustomers();
    const existingLocalCust = existingCustomers.find(
      (c) => phonesMatch(c.phone, canonicalPhone) && isRealName(c.name)
    );
    if (existingLocalCust) {
      matchedExistingName = existingLocalCust.name;
    }

    if (isGenericName && !matchedExistingName) {
      try {
        const usersSnap = await getDocs(collection(db, "users"));
        for (const d of usersSnap.docs) {
          const data = d.data();
          if (phonesMatch(data.phone, canonicalPhone) && isRealName(data.name)) {
            matchedExistingName = String(data.name).trim();
            break;
          }
        }
        if (!matchedExistingName) {
          const bkSnap = await getDocs(collection(db, "bookings"));
          for (const d of bkSnap.docs) {
            const data = d.data();
            if (
              phonesMatch(data.customerPhone || data.phone, canonicalPhone) &&
              isRealName(data.customerName || data.name)
            ) {
              matchedExistingName = String(data.customerName || data.name).trim();
              break;
            }
          }
        }
      } catch {
        // fallback to generic if Firestore lookup fails
      }
    }

    const resolvedName = !isGenericName
      ? cleanInputName
      : matchedExistingName || "Valued Customer";

    const customer = upsertCustomerInStore({
      phone: canonicalPhone,
      name: resolvedName,
    });

    try {
      const docRef = doc(db, "users", customer.id);
      await setDoc(
        docRef,
        {
          uid: customer.id,
          phone: customer.phone,
          name: customer.name,
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
    console.error("loginCustomerAction error:", err);
    return {
      success: false,
      error: "Authentication error. Please retry.",
    };
  }
}

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
    return getAllStoredDrivers();
  }
}

/**
 * Server Action for Driver login authentication.
 */
export async function loginDriverAction(
  identifier: string,
  _pin: string
): Promise<ActionResult<StoredDriver>> {
  try {
    const clean = identifier?.trim().toUpperCase();
    if (!clean) {
      return { success: false, error: "Driver ID or Plate Number is required." };
    }

    const drivers = await fetchDriversAuthoritative();
    const cleanCompact = clean.replace(/\s+/g, "");
    const match = drivers.find(
      (d) =>
        d.driverId.toUpperCase() === clean ||
        d.plate.toUpperCase() === clean ||
        (d.phone && d.phone.replace(/\s+/g, "").toUpperCase() === cleanCompact)
    );

    if (!match) {
      return {
        success: false,
        error: "Driver account not found. Please verify your Driver ID or registered Plate.",
      };
    }

    return {
      success: true,
      data: match,
    };
  } catch (err: unknown) {
    console.error("loginDriverAction error:", err);
    return {
      success: false,
      error: "Driver login failed.",
    };
  }
}

/**
 * Server Action to register/save a customer profile cleanly (e.g. from Admin Manual Booking).
 */
export async function registerCustomerAction(input: {
  phone: string;
  name: string;
  city?: string;
  email?: string;
}): Promise<ActionResult<StoredCustomer>> {
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

    const customer = upsertCustomerInStore({
      phone: canonicalPhone,
      name: cleanName,
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
  try {
    const cleanId = String(input.customerId || "").trim();
    const cleanPhone = String(input.phone || "").trim();
    const deleteBookings = Boolean(input.deleteBookings);

    if (!cleanId && !cleanPhone) {
      return { success: false, error: "Customer ID or phone number is required." };
    }

    // 1. Remove from local fleet-store.json immediately
    const removedLocal = deleteCustomerFromStore(cleanId, cleanPhone);
    let deletedUserDocs = removedLocal ? 1 : 0;
    let affectedBookings = cleanPhone
      ? archiveOrDeleteCustomerBookingsInStore(cleanPhone, deleteBookings)
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

          if (deleteBookings) {
            await deleteDoc(doc(db, "bookings", bDoc.id));
          } else {
            await updateDoc(doc(db, "bookings", bDoc.id), {
              customerArchived: true,
              updatedAt: nowTs,
            });
          }
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
  try {
    const localCustomers = getAllStoredCustomers();
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
