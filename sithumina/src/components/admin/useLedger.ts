"use client";

/** Live wallet payments and refunds, which together with bookings make up revenue. */
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { LedgerContext, Reversal, WalletEntry } from "@/lib/ledger";

export function useLedger(): LedgerContext & { error: boolean } {
  const [wallet, setWallet] = useState<WalletEntry[]>([]);
  const [reversals, setReversals] = useState<Reversal[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    const read = <T,>(name: string, set: (rows: T[]) => void) =>
      onSnapshot(
        collection(db, name),
        (snap) => set(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T)),
        () => setError(true)
      );
    const stopWallet = read<WalletEntry>("commission_transactions", setWallet);
    const stopReversals = read<Reversal>("payment_reversals", setReversals);
    return () => {
      stopWallet();
      stopReversals();
    };
  }, []);

  return { wallet, reversals, error };
}
