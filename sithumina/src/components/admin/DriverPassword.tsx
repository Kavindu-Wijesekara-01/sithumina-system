"use client";

import { useState } from "react";
import { setDriverPasswordAction } from "@/actions/accounts";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/identity";

/** Issue or reset the sign-in password of a driver or external owner. */
export default function DriverPassword({ driverId }: { driverId: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: "", ok: false });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await setDriverPasswordAction(driverId, password);
      setMessage(
        res.success
          ? { ok: true, text: `Saved. ${driverId} can now sign in with this password.` }
          : { ok: false, text: res.error }
      );
      if (res.success) setPassword("");
    } catch {
      setMessage({ ok: false, text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-gray-900">Sign-in password for {driverId}</h3>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          autoComplete="off"
          aria-label="New password"
          placeholder={`New password (${MIN_PASSWORD_LENGTH}+ characters)`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-64 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        />
        <button type="submit" disabled={busy || password.length < MIN_PASSWORD_LENGTH} className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 cursor-pointer">
          Set password
        </button>
      </div>
      {message.text && <p role="status" className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>}
    </form>
  );
}
