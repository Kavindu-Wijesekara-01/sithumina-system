/**
 * Targeted booking reads for the admin dashboard.
 *
 * Live: every open booking, plus the newest page. Older history is fetched a
 * page at a time with a cursor, and reports query just the range they need.
 */
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { OPEN_STATUSES } from "@/lib/trip-state";

export const PAGE_SIZE = 200;

type Doc = QueryDocumentSnapshot;
const bookings = () => collection(db, "bookings");

export interface BookingFeed {
  stop: () => void;
  /** Fetch the next older page. Resolves false when there is nothing more. */
  loadOlder: () => Promise<boolean>;
}

export function subscribeBookingFeed(
  onDocs: (docs: Doc[]) => void,
  onError: (error: Error) => void
): BookingFeed {
  let open: Doc[] = [];
  let recent: Doc[] = [];
  const older = new Map<string, Doc>();
  let cursor: Doc | null = null;
  let openReady = false;
  let recentReady = false;
  let stopped = false;

  const emit = () => {
    if (stopped || !openReady || !recentReady) return;
    // Live documents override older cached copies
    const merged = new Map<string, Doc>(older);
    for (const d of [...recent, ...open]) merged.set(d.id, d);
    onDocs(Array.from(merged.values()));
  };

  const stopOpen = onSnapshot(
    query(bookings(), where("status", "in", OPEN_STATUSES)),
    (snap) => {
      open = snap.docs;
      openReady = true;
      emit();
    },
    onError
  );
  const stopRecent = onSnapshot(
    query(bookings(), orderBy("createdAt", "desc"), limit(PAGE_SIZE)),
    (snap) => {
      recent = snap.docs;
      recentReady = true;
      if (older.size === 0) cursor = recent[recent.length - 1] || null;
      emit();
    },
    onError
  );

  return {
    stop: () => {
      stopped = true;
      stopOpen();
      stopRecent();
    },
    loadOlder: async () => {
      if (!cursor) return false;
      const snap = await getDocs(query(bookings(), orderBy("createdAt", "desc"), startAfter(cursor), limit(PAGE_SIZE)));
      snap.docs.forEach((d) => older.set(d.id, d));
      cursor = snap.docs[snap.docs.length - 1] || cursor;
      emit();
      return snap.docs.length === PAGE_SIZE;
    },
  };
}

const rows = async (...constraints: QueryConstraint[]) =>
  (await getDocs(query(bookings(), ...constraints))).docs.map((d) => ({ ...d.data(), id: d.id }));

/** Every booking, read page by page. Used only when "All time" is chosen. */
async function allBookings() {
  const result: Array<Record<string, unknown> & { id: string }> = [];
  let cursor: Doc | null = null;
  for (;;) {
    const snap: { docs: Doc[] } = await getDocs(
      query(bookings(), orderBy("createdAt", "desc"), ...(cursor ? [startAfter(cursor)] : []), limit(500))
    );
    snap.docs.forEach((d) => result.push({ ...d.data(), id: d.id }));
    if (snap.docs.length < 500) return result;
    cursor = snap.docs[snap.docs.length - 1];
  }
}

/**
 * Bookings with a trip that ended, or money received, between `from` and `to`.
 * A range starting at zero means all time.
 */
export async function fetchBookingsForPeriod(from: number, to: number) {
  if (from <= 0 && to >= Number.MAX_SAFE_INTEGER) return allBookings();
  const lists = await Promise.all(
    ["rideEndedAt", "paymentApprovedAt", "finalPaymentAt"].map((field) =>
      rows(where(field, ">=", Math.max(1, from)), where(field, "<", to))
    )
  );
  return Array.from(new Map(lists.flat().map((b) => [b.id, b])).values());
}
