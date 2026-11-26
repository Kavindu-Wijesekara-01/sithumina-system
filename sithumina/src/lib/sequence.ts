/**
 * Collision-proof record numbers, e.g. ST-BK-10001.
 *
 * Numbers start at 10001, above the old random four-digit IDs, and the counter
 * is advanced in the same transaction that writes the record, so two requests
 * can never receive the same ID or overwrite an existing document.
 */
import { db } from "@/lib/firebase";
import { doc, runTransaction } from "firebase/firestore";

const FIRST = 10000;

export async function createWithSequentialId<T extends object>(
  collectionName: string,
  counterName: string,
  prefix: string,
  build: (id: string) => T
): Promise<T> {
  const counterRef = doc(db, "counters", counterName);
  return runTransaction(db, async (tx) => {
    const counter = await tx.get(counterRef);
    let next = Math.max(Number(counter.data()?.last) || 0, FIRST) + 1;
    while ((await tx.get(doc(db, collectionName, `${prefix}-${next}`))).exists()) next += 1;

    const id = `${prefix}-${next}`;
    const record = build(id);
    tx.set(counterRef, { last: next, updatedAt: Date.now() }, { merge: true });
    // Firestore rejects undefined values
    tx.set(doc(db, collectionName, id), JSON.parse(JSON.stringify(record)));
    return record;
  });
}
