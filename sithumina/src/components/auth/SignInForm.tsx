"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { registerCustomerAccountAction } from "@/actions/accounts";
import { MIN_PASSWORD_LENGTH, type Role } from "@/lib/auth/identity";

const COPY: Record<Role, { title: string; id: string; help: string }> = {
  admin: { title: "Admin sign in", id: "Admin ID", help: "Head Office staff only." },
  driver: { title: "Driver and vehicle owner sign in", id: "Driver ID", help: "Your password is issued by the office." },
  customer: { title: "Customer sign in", id: "Phone number", help: "Sign in to follow your bookings and upload payments." },
};

const field = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-900";

export default function SignInForm({ role }: { role: Role }) {
  const { profile, signIn, logout, loading } = useAuth();
  const [register, setRegister] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [proof, setProof] = useState("");
  const [needsProof, setNeedsProof] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const copy = COPY[role];

  if (loading) return <p className="p-8 text-center text-sm text-gray-500">Checking your sign-in...</p>;

  if (profile && profile.role !== role) {
    return (
      <div className="mx-auto w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center">
        <p className="text-sm text-gray-700">
          You are signed in as {profile.name} ({profile.role}). Sign out to use a different account.
        </p>
        <button type="button" onClick={logout} className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white cursor-pointer">
          Sign out
        </button>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (register) {
        const created = await registerCustomerAccountAction({ phone: identifier, password, name, proof });
        if (!created.success) {
          if (created.code === "PROOF_REQUIRED") setNeedsProof(true);
          setError(created.error);
          return;
        }
      }
      const result = await signIn(identifier, password);
      if (!result.ok) setError(result.error || "Could not sign in.");
    } catch {
      setError("No connection. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{register ? "Create your account" : copy.title}</h2>
        <p className="mt-1 text-sm text-gray-500">{copy.help}</p>
      </div>
      {register && (
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          Name
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm text-gray-700">
        {copy.id}
        <input
          className={field}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          inputMode={role === "customer" ? "tel" : "text"}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-700">
        Password
        <input
          className={field}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={register ? "new-password" : "current-password"}
          minLength={register ? MIN_PASSWORD_LENGTH : undefined}
          required
        />
        {register && <span className="text-xs text-gray-500">At least {MIN_PASSWORD_LENGTH} characters.</span>}
      </label>
      {register && needsProof && (
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          NIC used on your bookings (or a booking ID if you never gave one)
          <input className={field} value={proof} onChange={(e) => setProof(e.target.value)} required />
        </label>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 cursor-pointer">
        {busy ? "Please wait..." : register ? "Create account" : "Sign in"}
      </button>
      {role === "customer" && (
        <button
          type="button"
          onClick={() => { setRegister(!register); setError(""); setNeedsProof(false); }}
          className="text-sm text-gray-600 underline cursor-pointer"
        >
          {register ? "I already have an account" : "Create an account"}
        </button>
      )}
    </form>
  );
}
