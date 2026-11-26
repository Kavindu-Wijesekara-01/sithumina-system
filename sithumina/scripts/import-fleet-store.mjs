/**
 * One-time import of the old data/fleet-store.json into Firestore.
 *
 * Only records that do NOT already exist in Firestore are added; nothing is
 * overwritten. Without --apply it only reports what it would do.
 *
 *   node --env-file=.env scripts/import-fleet-store.mjs
 *   node --env-file=.env scripts/import-fleet-store.mjs --apply
 */
import { readFile } from "node:fs/promises";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// The Admin SDK works both before and after the new security rules are deployed
const apply = process.argv.includes("--apply");
const key = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
if (!key) {
  console.error("FIREBASE_SERVICE_ACCOUNT is not set. Run with --env-file=.env");
  process.exit(1);
}
const account = JSON.parse(key.startsWith("{") ? key : Buffer.from(key, "base64").toString("utf8"));
initializeApp({ credential: cert(account) });
const db = getFirestore();
const raw = await readFile(new URL("../data/fleet-store.json", import.meta.url), "utf8");
const store = JSON.parse(raw.replace(/^﻿/, ""));

// [JSON key, Firestore collection, document ID, extra fields]
const PLAN = [
  ["bookings", "bookings", (r) => r.id],
  ["complaints", "complaints", (r) => r.id],
  ["registrations", "vehicle_registrations", (r) => r.id],
  ["outsideEmployees", "outside_employees", (r) => r.id],
  ["commissionTransactions", "commission_transactions", (r) => r.id],
  ["topupSlips", "outside_topup_slips", (r) => r.id],
  ["inquiries", "inquiries", (r) => r.id],
  ["reviews", "reviews", (r) => r.id],
  ["drivers", "drivers", (r) => r.driverId || r.id],
  ["lorries", "lorries_registry", (r) => r.id],
  ["customers", "users", (r) => r.id, { role: "customer" }],
];

console.log(`Project: ${account.project_id}. ${apply ? "IMPORTING" : "Dry run, nothing will be written"}.`);
for (const [key, name, idOf, extra] of PLAN) {
  const missing = [];
  for (const record of store[key] || []) {
    const id = String(idOf(record) || "").trim();
    if (!id || id.includes("/")) continue;
    if (!(await db.collection(name).doc(id).get()).exists) missing.push([id, record]);
  }
  console.log(`${key}: ${(store[key] || []).length} in file, ${missing.length} not in ${name}`);
  for (const [id, record] of missing) {
    console.log(`  ${apply ? "add" : "would add"} ${name}/${id}`);
    if (apply) await db.collection(name).doc(id).create(JSON.parse(JSON.stringify({ ...record, ...extra })));
  }
}
await db.terminate();
