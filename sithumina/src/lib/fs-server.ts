/**
 * Server-side Firestore, backed by the Admin SDK but exposing the same function
 * names as the browser SDK, so server modules read the same way as client code.
 */
import type {
  DocumentSnapshot,
  Query,
  QueryDocumentSnapshot,
  Transaction as AdminTransaction,
  WhereFilterOp,
} from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

type Data = Record<string, any>;

/** Placeholder so call sites keep the familiar `doc(db, ...)` shape. */
export const db = {} as const;

export interface Ref {
  path: string;
  id: string;
}
export interface QueryRef {
  build: () => Query;
}
export type Constraint = (q: Query) => Query;

export const doc = (_db: unknown, ...segments: string[]): Ref => ({
  path: segments.join("/"),
  id: segments[segments.length - 1],
});

export const collection = (_db: unknown, ...segments: string[]): QueryRef => ({
  build: () => adminDb().collection(segments.join("/")),
});

export const query = (source: QueryRef, ...constraints: Constraint[]): QueryRef => ({
  build: () => constraints.reduce((q, apply) => apply(q), source.build()),
});

export const where = (field: string, op: WhereFilterOp, value: unknown): Constraint => (q) =>
  q.where(field, op, value);
export const orderBy = (field: string, direction: "asc" | "desc" = "asc"): Constraint => (q) =>
  q.orderBy(field, direction);
export const limit = (count: number): Constraint => (q) => q.limit(count);

const snapshot = (s: DocumentSnapshot) => ({
  id: s.id,
  exists: () => s.exists,
  // `any` mirrors the browser SDK, where exists() guards access to the data
  data: () => s.data() as any,
});
const row = (s: QueryDocumentSnapshot) => ({
  id: s.id,
  exists: () => true,
  data: () => s.data() as Data,
});

const target = (ref: Ref) => adminDb().doc(ref.path);

export const getDoc = async (ref: Ref) => snapshot(await target(ref).get());

export async function getDocs(source: QueryRef) {
  const result = await source.build().get();
  const docs = result.docs.map(row);
  return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn: (d: ReturnType<typeof row>) => void) => docs.forEach(fn) };
}

export async function setDoc(ref: Ref, data: object, options?: { merge?: boolean }): Promise<void> {
  await target(ref).set(data as Data, options || {});
}

export async function updateDoc(ref: Ref, data: object): Promise<void> {
  await target(ref).update(data as Data);
}

export async function deleteDoc(ref: Ref): Promise<void> {
  await target(ref).delete();
}

export interface Transaction {
  get: (ref: Ref) => Promise<ReturnType<typeof snapshot>>;
  set: (ref: Ref, data: object, options?: { merge?: boolean }) => void;
  update: (ref: Ref, data: object) => void;
}

export function runTransaction<T>(_db: unknown, work: (tx: Transaction) => Promise<T>): Promise<T> {
  return adminDb().runTransaction((tx: AdminTransaction) =>
    work({
      get: async (ref) => snapshot(await tx.get(target(ref))),
      set: (ref, data, options) => void tx.set(target(ref), data as Data, options || {}),
      update: (ref, data) => void tx.update(target(ref), data as Data),
    })
  );
}
