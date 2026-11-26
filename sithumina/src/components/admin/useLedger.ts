"use client";

/** Live wallet payments and refunds, which together with bookings make up revenue. */
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, type Query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import type { LedgerContext, Reversal, WalletEntry } from "@/lib/ledger";

export function useLedger(): LedgerContext & { error: boolean } {
  const [wallet, setWallet] = useState<WalletEntry[]>([]);
  const [reversals, setReversals] = useState<Reversal[]>([]);
  const [error, setError] = useState(false);

  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    // The rules refuse these reads until an admin is signed in
    if (!isAdmin) return;
    setError(false);
    const read = <T,>(source: Query, set: (rows: T[]) => void) =>
      onSnapshot(
        source,
        (snap) => set(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T)),
        () => setError(true)
      );
    // Only money coming in: commission entries are not revenue
    const stopWallet = read<WalletEntry>(
      query(collection(db, "commission_transactions"), where("type", "in", ["initial_deposit", "topup"])),
      setWallet
    );
    const stopReversals = read<Reversal>(query(collection(db, "payment_reversals")), setReversals);
    return () => {
      stopWallet();
      stopReversals();
    };
  }, [isAdmin]);

  return { wallet, reversals, error };
}
