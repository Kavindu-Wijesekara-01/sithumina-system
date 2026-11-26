/**
 * Firestore-authoritative Driver ID allocation (D-10, D-11, ...).
 *
 * IDs are reserved through a counter document inside a transaction, so two
 * server instances can never hand out the same ID. Errors are deliberately NOT
 * swallowed: if Firestore cannot be reached, no ID is issued.
 */
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, runTransaction, type Transaction } from "firebase/firestore";

const COUNTER_PATH = ["counters", "driver_ids"] as const;
const FIRST_ID_NUMBER = 10;

/** Highest D-number already present anywhere (covers records created before the counter existed). */
export async function scanHighestDriverNumber(): Promise<number> {
  let highest = FIRST_ID_NUMBER - 1;
  const snaps = await Promise.all(
    ["drivers", "outside_employees", "lorries_registry"].map((name) => getDocs(collection(db, name)))
  );
  for (const snap of snaps) {
    snap.forEach((d) => {
      const data = d.data();
      for (const value of [d.id, data.driverId]) {
        const match = String(value || "").trim().match(/^D-(\d+)$/i);
        if (match) highest = Math.max(highest, Number(match[1]));
      }
    });
  }
  return highest;
}

/**
 * Picks the next free ID inside an existing transaction (reads only).
 * The caller MUST call `commit()` after all of its own reads are done.
 */
export async function reserveDriverIdInTransaction(
  tx: Transaction,
  scannedHighest: number
): Promise<{ id: string; commit: () => void }> {
  const counterRef = doc(db, ...COUNTER_PATH);
  const counter = await tx.get(counterRef);
  let next = Math.max(Number(counter.data()?.last) || 0, scannedHighest) + 1;

  // Skip any ID that some other code path already wrote
  while (
    (await tx.get(doc(db, "drivers", `D-${next}`))).exists() ||
    (await tx.get(doc(db, "outside_employees", `D-${next}`))).exists()
  ) {
    next += 1;
  }

  return {
    id: `D-${next}`,
    commit: () => {
      tx.set(counterRef, { last: next, updatedAt: Date.now() }, { merge: true });
    },
  };
}

/** Reserve a standalone Driver ID (for company riders). */
export async function allocateDriverId(): Promise<string> {
  const highest = await scanHighestDriverNumber();
  return runTransaction(db, async (tx) => {
    const reservation = await reserveDriverIdInTransaction(tx, highest);
    reservation.commit();
    return reservation.id;
  });
}
