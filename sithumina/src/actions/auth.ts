"use server";

import {
  upsertCustomerInStore,
  getAllStoredCustomers,
  getAllStoredDrivers,
  StoredCustomer,
  StoredDriver,
} from "@/lib/server-store";
import { normalizePhoneNumber, phonesMatch } from "@/lib/phone-utils";
import { ActionResult } from "./types";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";

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
 * Server Action to get all registered customers.
 */
export async function getCustomersAction(): Promise<ActionResult<StoredCustomer[]>> {
  try {
    try {
      const snap = await getDocs(collection(db, "users"));
      const customers: StoredCustomer[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: String(data.uid || d.id),
            name: String(data.name || "Customer"),
            phone: String(data.phone || ""),
            email: data.email || "",
            city: data.city || "",
            createdAt: Number(data.createdAt) || 0,
            lastLoginAt: Number(data.lastLoginAt) || Number(data.createdAt) || 0,
          };
        })
        .sort((a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0));
      return { success: true, data: customers };
    } catch {
      const customers = getAllStoredCustomers();
      return { success: true, data: customers };
    }
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
