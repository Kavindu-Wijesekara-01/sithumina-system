"use server";

import { ActionResult } from "./types";
import { AccountError, upsertAccount, disableAccount } from "@/lib/auth/accounts";
import { authorize } from "@/lib/auth/server";
import { looksLikePhone } from "@/lib/auth/identity";
import { normalizePhoneNumber } from "@/lib/phone-utils";
import { ensureDriverRecord } from "@/lib/riders";
import { getBookingsByCustomerPhone, upsertCustomerInStore } from "@/lib/server-store";

function failure(context: string, err: unknown): { success: false; error: string } {
  if (err instanceof AccountError) return { success: false, error: err.message };
  console.error(`${context} error:`, err);
  return { success: false, error: "Could not update the account. Please try again." };
}

/**
 * Customer self-registration. Without SMS we cannot prove who holds a number, so
 * a number that already has bookings can only be claimed by someone who knows
 * the NIC or a booking ID on those bookings.
 */
export async function registerCustomerAccountAction(input: {
  phone: string;
  password: string;
  name: string;
  proof?: string;
}): Promise<ActionResult<boolean>> {
  try {
    const phone = (input.phone || "").trim();
    const name = (input.name || "").trim();
    if (!looksLikePhone(phone)) return { success: false, error: "Enter a valid phone number." };
    if (name.length < 2) return { success: false, error: "Enter your name." };

    const history = await getBookingsByCustomerPhone(phone);
    if (history.length > 0) {
      const proof = (input.proof || "").trim().toUpperCase();
      const matches = history.some(
        (b) => b.id.toUpperCase() === proof || (b.customerIdNumber || "").toUpperCase() === proof
      );
      if (!proof || !matches) {
        return {
          success: false,
          error: "This number already has bookings. Enter the NIC used on them, or one of the booking IDs.",
          code: "PROOF_REQUIRED",
        };
      }
    }

    await upsertAccount({
      identifier: phone,
      password: input.password,
      displayName: name,
      claims: { role: "customer", customerPhone: normalizePhoneNumber(phone) },
      createOnly: true,
    });
    await upsertCustomerInStore({ phone, name });
    return { success: true, data: true };
  } catch (err) {
    return failure("registerCustomerAccountAction", err);
  }
}

/** Admin: create or reset the sign-in of a driver or external owner. */
export async function setDriverPasswordAction(driverId: string, password: string): Promise<ActionResult<boolean>> {
  const auth = await authorize("admin");
  if (!auth.ok) return auth.denied;
  try {
    const id = (driverId || "").trim().toUpperCase();
    // Rebuilds the driver record for outside owners saved without one
    const driver = await ensureDriverRecord(id);
    if (!driver) return { success: false, error: "Driver not found." };
    await upsertAccount({
      identifier: id,
      password,
      displayName: String(driver.name || id),
      claims: { role: "driver", driverId: id },
    });
    return { success: true, data: true };
  } catch (err) {
    return failure("setDriverPasswordAction", err);
  }
}

/** Admin: reset a customer's password. */
export async function resetCustomerPasswordAction(phone: string, password: string): Promise<ActionResult<boolean>> {
  const auth = await authorize("admin");
  if (!auth.ok) return auth.denied;
  try {
    if (!looksLikePhone(phone)) return { success: false, error: "Enter a valid phone number." };
    await upsertAccount({
      identifier: phone,
      password,
      claims: { role: "customer", customerPhone: normalizePhoneNumber(phone) },
    });
    return { success: true, data: true };
  } catch (err) {
    return failure("resetCustomerPasswordAction", err);
  }
}

export async function disableDriverAccountAction(driverId: string): Promise<ActionResult<boolean>> {
  const auth = await authorize("admin");
  if (!auth.ok) return auth.denied;
  try {
    await disableAccount((driverId || "").trim().toUpperCase());
    return { success: true, data: true };
  } catch (err) {
    return failure("disableDriverAccountAction", err);
  }
}
