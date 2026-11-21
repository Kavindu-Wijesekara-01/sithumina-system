"use server";

import { revalidatePath } from "next/cache";
import {
  addRegistrationInStore,
  getAllStoredRegistrations,
  updateRegistrationStatusInStore,
  registerDriverInStore,
  getAllStoredOutsideEmployees,
  getStoredOutsideEmployeeByIdNumber,
  getStoredOutsideEmployeeByPlate,
  toggleOutsideEmployeeAvailabilityInStore,
  getStoredCommissionTransactions,
  getAllTopupSlipsInStore,
  addTopupSlipInStore,
  approveTopupSlipInStore,
  deleteTopupSlipInStore,
  StoredRegistration,
  StoredOutsideEmployee,
  StoredCommissionTransaction,
  StoredTopupSlip,
} from "@/lib/server-store";
import {
  ActionResult,
  VehicleRegistrationActionInput,
  OutsideEmployeeRecord,
  CommissionTransactionRecord,
  TopupSlipRecord,
} from "./types";
import { db } from "@/lib/firebase";
import { collection, addDoc, doc, setDoc, updateDoc, getDocs, deleteDoc } from "firebase/firestore";

/**
 * Server Action for vehicle owners / fleet partners to register their outside lorry.
 */
export async function registerVehicleAction(
  input: VehicleRegistrationActionInput
): Promise<ActionResult<{ id: string; registration: StoredRegistration }>> {
  try {
    const ownerName = input.ownerName?.trim();
    const phone = input.phone?.trim();
    const idNumber = input.idNumber?.trim();
    const plateNumber = input.plateNumber?.trim().toUpperCase();
    const vehicleType = input.vehicleType?.trim() || "14ft Lorry";
    const baseCity = input.baseCity?.trim() || "Colombo";
    const capacity = input.capacity?.trim() || "Standard Load";
    const maxWeight = input.maxWeight?.trim() || "";
    const dimensions = input.dimensions?.trim() || "";
    const province = input.province?.trim() || "Western";
    const images = Array.isArray(input.images) ? input.images : [];
    const depositSlipUrl = input.depositSlipUrl?.trim() || "";
    const initialDepositAmount = Number(input.initialDepositAmount) || 5000;

    if (!ownerName) {
      return { success: false, error: "Owner name is required / අයිතිකරුගේ නම අවශ්‍ය වේ." };
    }
    if (!phone || phone.length < 8) {
      return { success: false, error: "A valid phone number is required / වලංගු දුරකථන අංකයක් අවශ්‍ය වේ." };
    }
    if (!idNumber || idNumber.length < 5) {
      return { success: false, error: "National ID Number is required / ජාතික හැඳුනුම්පත් අංකය (ID Number) අනිවාර්ය වේ." };
    }
    if (!plateNumber) {
      return { success: false, error: "Vehicle plate number is required (e.g. WP LK-1234) / වාහන අංකය අවශ්‍ය වේ." };
    }

    const registration = addRegistrationInStore({
      ownerName,
      phone,
      idNumber,
      vehicleNumber: plateNumber,
      plateNumber,
      vehicleType,
      baseCity,
      capacity,
      maxWeight,
      dimensions,
      images,
      depositSlipUrl,
      initialDepositAmount,
      province,
    });

    // Cloud Firestore sync (primary source of truth)
    try {
      const docRef = doc(db, "vehicle_registrations", registration.id);
      await setDoc(
        docRef,
        {
          id: registration.id,
          ownerName,
          phone,
          idNumber,
          plateNumber,
          vehicleNumber: plateNumber,
          vehicleType,
          baseCity,
          capacity,
          maxWeight,
          dimensions,
          images,
          depositSlipUrl,
          initialDepositAmount,
          province,
          status: "pending",
          createdAt: registration.createdAt,
          updatedAt: registration.createdAt,
        },
        { merge: true }
      );
    } catch (cloudErr) {
      console.warn("Firestore registration sync notice:", cloudErr);
    }

    try {
      revalidatePath("/register-vehicle");
      revalidatePath("/manage");
      revalidatePath("/admin");
    } catch {
      // Ignored
    }

    return {
      success: true,
      data: {
        id: registration.id,
        registration,
      },
      message: "Vehicle registration submitted successfully with Rs. 5,000 deposit confirmation.",
    };
  } catch (err: unknown) {
    console.error("registerVehicleAction error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to register vehicle.",
    };
  }
}

/**
 * Server Action to get all vehicle registrations directly from Firestore.
 */
export async function getAllRegistrationsAction(): Promise<ActionResult<StoredRegistration[]>> {
  try {
    const colRef = collection(db, "vehicle_registrations");
    const snap = await getDocs(colRef);
    const registrations = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as unknown as StoredRegistration[];

    return {
      success: true,
      data: registrations,
    };
  } catch (err: unknown) {
    console.error("getAllRegistrationsAction error:", err);
    return {
      success: false,
      error: "Failed to retrieve registrations.",
    };
  }
}

/**
 * Server Action to update vehicle registration status.
 */
export async function updateRegistrationStatusAction(
  id: string,
  status: "pending" | "approved" | "rejected"
): Promise<ActionResult<StoredRegistration>> {
  try {
    if (!id) {
      return { success: false, error: "Registration ID is required." };
    }

    const updated = updateRegistrationStatusInStore(id, status);

    try {
      const docRef = doc(db, "vehicle_registrations", id);
      await updateDoc(docRef, { status, updatedAt: Date.now() });
    } catch (e) {
      console.warn("Firestore registration status update notice:", e);
    }

    try {
      revalidatePath("/register-vehicle");
      revalidatePath("/manage");
    } catch {
      // Ignored
    }

    return {
      success: true,
      data: updated || ({ id, status } as StoredRegistration),
    };
  } catch (err: unknown) {
    console.error("updateRegistrationStatusAction error:", err);
    return {
      success: false,
      error: "Failed to update registration status.",
    };
  }
}

/**
 * Server Action to approve a registration and instantly inject it into the active live fleet.
 */
export async function approveRegistrationAndAddToFleetAction(
  id: string,
  route?: string
): Promise<ActionResult<StoredRegistration>> {
  try {
    const reg = updateRegistrationStatusInStore(id, "approved");

    try {
      const docRef = doc(db, "vehicle_registrations", id);
      await updateDoc(docRef, {
        status: "approved",
        outsideEmployeeId: reg?.outsideEmployeeId,
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.warn("Firestore approve registration notice:", e);
    }

    if (reg) {
      const cleanPlate = (reg.vehicleNumber || "").toUpperCase().trim();
      const docId = `lorry-${cleanPlate.replace(/[^A-Z0-9]/gi, "").toLowerCase()}`;
      const employeeId = reg.outsideEmployeeId || `ST-OUT-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Sync outside employee to Firestore
      try {
        await setDoc(
          doc(db, "outside_employees", employeeId),
          {
            id: employeeId,
            registrationId: reg.id,
            name: reg.ownerName,
            phone: reg.phone,
            idNumber: reg.idNumber || "",
            plateNumber: cleanPlate,
            vehicleType: reg.vehicleType,
            baseCity: reg.baseCity || "Colombo",
            balance: reg.initialDepositAmount || 5000,
            isAvailable: true,
            status: "active",
            totalCommissionDeducted: 0,
            totalHiresCompleted: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      } catch (e) {
        console.warn("Firestore outside_employees sync notice:", e);
      }

      // 2. Sync initial Rs. 5,000 deposit transaction to Firestore
      try {
        const txId = `TX-${Date.now()}-DEP`;
        await setDoc(doc(db, "commission_transactions", txId), {
          id: txId,
          employeeId,
          idNumber: reg.idNumber || "",
          type: "initial_deposit",
          amount: reg.initialDepositAmount || 5000,
          balanceBefore: 0,
          balanceAfter: reg.initialDepositAmount || 5000,
          note: `Approved Initial Registration Deposit (රු. ${(reg.initialDepositAmount || 5000).toLocaleString()})`,
          slipUrl: reg.depositSlipUrl || "",
          createdAt: Date.now(),
        });
      } catch (e) {
        console.warn("Firestore commission_transactions sync notice:", e);
      }

      // 3. Register driver in local store
      registerDriverInStore({
        name: reg.ownerName,
        phone: reg.phone,
        plate: cleanPlate,
        vehicleType: reg.vehicleType,
        route: route || `${reg.baseCity || "Colombo"} – Island-wide`,
      });

      // 4. Register outside lorry into lorries_registry and lorries collections in Firestore
      if (cleanPlate) {
        try {
          const lorryData = {
            id: docId,
            plate: cleanPlate,
            vehicleNumber: cleanPlate,
            vehicleType: reg.vehicleType || "Lorry",
            ownerName: reg.ownerName,
            driverName: reg.ownerName,
            driverPhone: reg.phone,
            phone: reg.phone,
            driverId: employeeId,
            capacity: reg.capacity || "Standard",
            maxWeight: reg.maxWeight || "",
            dimensions: reg.dimensions || "",
            baseCity: reg.baseCity || "Colombo",
            startLocation: reg.baseCity || "Colombo",
            province: reg.province || "Western",
            route: route || `${reg.baseCity || "Colombo"} – Island-wide`,
            isOutsideLorry: true,
            ownershipType: "outside",
            ownerIdNumber: reg.idNumber || "",
            isAvailable: true,
            status: "empty",
            images: reg.images || [],
            imageUrl: (reg.images && reg.images[0]) || "",
            updatedAt: Date.now(),
          };

          await setDoc(doc(db, "lorries_registry", cleanPlate), lorryData, { merge: true });
          await setDoc(doc(db, "lorries_registry", docId), lorryData, { merge: true });
          await setDoc(doc(db, "lorries", docId), lorryData, { merge: true });
        } catch (e) {
          console.warn("Firestore lorries_registry sync notice:", e);
        }
      }
    }

    try {
      revalidatePath("/");
      revalidatePath("/find-empty-lorry");
      revalidatePath("/book-vehicle");
      revalidatePath("/register-vehicle");
      revalidatePath("/login");
      revalidatePath("/admin");
      revalidatePath("/manage");
    } catch {
      // Ignored
    }

    return {
      success: true,
      data: reg || ({ id, status: "approved" } as StoredRegistration),
      message: "Registration approved, Outside Employee ID allocated, and Rs. 5,000 balance activated.",
    };
  } catch (err: unknown) {
    console.error("approveRegistrationAndAddToFleetAction error:", err);
    return {
      success: false,
      error: "Failed to approve registration.",
    };
  }
}

/**
 * Server Action for Employee Login via ID Number (NIC).
 */
export async function loginOutsideEmployeeAction(
  idNumber: string
): Promise<ActionResult<{ employee: StoredOutsideEmployee; transactions: StoredCommissionTransaction[] }>> {
  try {
    const cleanId = (idNumber || "").trim().toLowerCase();
    if (!cleanId) {
      return { success: false, error: "National ID Number (NIC) is required / හැඳුනුම්පත් අංකය ඇතුළත් කරන්න." };
    }

    let emp = getStoredOutsideEmployeeByIdNumber(cleanId);

    // If not found in local memory, check Firestore outside_employees
    if (!emp) {
      try {
        const snap = await getDocs(collection(db, "outside_employees"));
        for (const d of snap.docs) {
          const data = d.data() as StoredOutsideEmployee;
          if ((data.idNumber || "").trim().toLowerCase() === cleanId) {
            emp = data;
            break;
          }
        }
      } catch (e) {
        console.warn("Firestore outside_employees lookup notice:", e);
      }
    }

    // Fallback: If not in outside_employees, check approved vehicle_registrations
    if (!emp) {
      const storeRegs = getAllStoredRegistrations();
      const matchedReg = storeRegs.find(
        (r) => (r.idNumber || "").trim().toLowerCase() === cleanId && r.status === "approved"
      );
      if (matchedReg) {
        // Auto-initialize if registration was approved
        const approved = updateRegistrationStatusInStore(matchedReg.id, "approved");
        if (approved) {
          emp = getStoredOutsideEmployeeByIdNumber(cleanId);
        }
      }
    }

    if (!emp) {
      return {
        success: false,
        error:
          "No registered outside vehicle owner found with this ID Number. Make sure your vehicle registration is approved by Admin / මෙම හැඳුනුම්පත් අංකයට අදාළ ලියාපදිංචියක් හමු නොවීය.",
      };
    }

    const transactions = getStoredCommissionTransactions(emp.idNumber || emp.id);

    return {
      success: true,
      data: {
        employee: emp,
        transactions,
      },
    };
  } catch (err: unknown) {
    console.error("loginOutsideEmployeeAction error:", err);
    return {
      success: false,
      error: "Failed to authenticate employee / පිවිසීම අසාර්ථක විය.",
    };
  }
}

/**
 * Server Action to toggle Outside Employee availability (Available / Unavailable).
 */
export async function toggleOutsideDutyAction(
  idNumber: string,
  isAvailable: boolean
): Promise<ActionResult<{ isAvailable: boolean }>> {
  try {
    const cleanId = (idNumber || "").trim();
    if (!cleanId) return { success: false, error: "ID Number is required." };

    const res = toggleOutsideEmployeeAvailabilityInStore(cleanId, isAvailable);

    // Sync to Firestore
    try {
      if (res.employee) {
        await updateDoc(doc(db, "outside_employees", res.employee.id), {
          isAvailable,
          updatedAt: Date.now(),
        });

        const cleanPlate = (res.employee.plateNumber || "").trim().toUpperCase();
        if (cleanPlate) {
          const docId = `lorry-${cleanPlate.replace(/[^A-Z0-9]/gi, "").toLowerCase()}`;
          const lorryStatus = isAvailable ? "empty" : "on_trip";
          const lastUpdated = isAvailable ? "Available" : "Unavailable";
          await updateDoc(doc(db, "lorries_registry", cleanPlate), {
            isAvailable,
            status: lorryStatus,
            lastUpdated,
            updatedAt: Date.now(),
          }).catch(() => {});
          await updateDoc(doc(db, "lorries_registry", docId), {
            isAvailable,
            status: lorryStatus,
            lastUpdated,
            updatedAt: Date.now(),
          }).catch(() => {});
          await updateDoc(doc(db, "lorries", docId), {
            isAvailable,
            status: lorryStatus,
            lastUpdated,
            updatedAt: Date.now(),
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn("Firestore toggle duty notice:", e);
    }

    try {
      revalidatePath("/book-vehicle");
      revalidatePath("/login");
      revalidatePath("/admin");
    } catch {}

    return {
      success: true,
      data: { isAvailable: res.isAvailable },
      message: isAvailable
        ? "Status set to Available / සේවයට සූදානම් ලෙස සටහන් විය."
        : "Status set to Unavailable / තාවකාලිකව සේවයෙන් බැහැර ලෙස සටහන් විය.",
    };
  } catch (err: unknown) {
    console.error("toggleOutsideDutyAction error:", err);
    return { success: false, error: "Failed to update availability status." };
  }
}

/**
 * Server Action for Outside Employee to upload a Top-up Bank Slip.
 */
export async function submitOutsideTopupSlipAction(input: {
  idNumber: string;
  amount: number;
  bankUsed?: string;
  slipUrl: string;
}): Promise<ActionResult<StoredTopupSlip>> {
  try {
    const cleanId = (input.idNumber || "").trim();
    const amount = Number(input.amount || 0);
    const slipUrl = (input.slipUrl || "").trim();

    if (!cleanId) return { success: false, error: "ID Number is required." };
    if (!amount || amount <= 0) return { success: false, error: "Valid top-up amount is required." };
    if (!slipUrl) return { success: false, error: "Please upload the bank deposit slip photo." };

    const slip = addTopupSlipInStore({
      idNumber: cleanId,
      amount,
      bankUsed: input.bankUsed,
      slipUrl,
    });

    // Sync to Firestore
    try {
      await setDoc(doc(db, "outside_topup_slips", slip.id), slip, { merge: true });
    } catch (e) {
      console.warn("Firestore topup slip sync notice:", e);
    }

    try {
      revalidatePath("/login");
      revalidatePath("/admin");
    } catch {}

    return {
      success: true,
      data: slip,
      message: "Top-up slip submitted successfully. It will be credited to your balance upon Admin approval.",
    };
  } catch (err: unknown) {
    console.error("submitOutsideTopupSlipAction error:", err);
    return { success: false, error: "Failed to submit top-up slip." };
  }
}

/**
 * Server Action to fetch all outside employees for Admin.
 */
export async function getAllOutsideEmployeesAction(): Promise<ActionResult<StoredOutsideEmployee[]>> {
  try {
    const list = getAllStoredOutsideEmployees();
    return { success: true, data: list };
  } catch (err: unknown) {
    console.error("getAllOutsideEmployeesAction error:", err);
    return { success: false, error: "Failed to fetch outside employees." };
  }
}

/**
 * Server Action to fetch all topup slips for Admin.
 */
export async function getAllTopupSlipsAction(): Promise<ActionResult<StoredTopupSlip[]>> {
  try {
    const list = getAllTopupSlipsInStore();
    return { success: true, data: list };
  } catch (err: unknown) {
    console.error("getAllTopupSlipsAction error:", err);
    return { success: false, error: "Failed to fetch top-up slips." };
  }
}

/**
 * Server Action to approve topup slip.
 */
export async function approveTopupSlipAction(
  slipId: string
): Promise<ActionResult<{ slip: StoredTopupSlip }>> {
  try {
    const res = approveTopupSlipInStore(slipId);
    if (!res.success || !res.slip) {
      return { success: false, error: res.error || "Failed to approve slip." };
    }

    // Sync to Firestore
    try {
      await updateDoc(doc(db, "outside_topup_slips", slipId), {
        status: "approved",
        reviewedAt: Date.now(),
      });
      const emp = getStoredOutsideEmployeeByIdNumber(res.slip.idNumber);
      if (emp) {
        await updateDoc(doc(db, "outside_employees", emp.id), {
          balance: emp.balance,
          updatedAt: Date.now(),
        });
      }
    } catch (e) {
      console.warn("Firestore approve slip notice:", e);
    }

    try {
      revalidatePath("/login");
      revalidatePath("/admin");
    } catch {}

    return { success: true, data: { slip: res.slip }, message: "Top-up slip approved and balance credited." };
  } catch (err: unknown) {
    console.error("approveTopupSlipAction error:", err);
    return { success: false, error: "Failed to approve top-up slip." };
  }
}

/**
 * Server Action to delete/reject topup slip.
 */
export async function deleteTopupSlipAction(slipId: string): Promise<ActionResult<boolean>> {
  try {
    const deleted = deleteTopupSlipInStore(slipId);
    try {
      await deleteDoc(doc(db, "outside_topup_slips", slipId));
    } catch (e) {
      console.warn("Firestore delete slip notice:", e);
    }

    try {
      revalidatePath("/login");
      revalidatePath("/admin");
    } catch {}

    return { success: true, data: deleted, message: "Top-up slip removed." };
  } catch (err: unknown) {
    console.error("deleteTopupSlipAction error:", err);
    return { success: false, error: "Failed to delete top-up slip." };
  }
}
