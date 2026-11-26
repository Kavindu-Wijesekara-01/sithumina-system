/**
 * One-time preparation of existing data for the role-based Firestore rules.
 * Run BEFORE deploying the rules. Without --apply it only reports.
 *
 *   node --env-file=.env.local scripts/prepare-security.mjs
 *   node --env-file=.env.local scripts/prepare-security.mjs --apply
 *
 *  1. Stores every booking and payment slip phone as 0XXXXXXXXX, so customers
 *     can read their own records.
 *  2. Removes owners' NIC numbers from the publicly readable vehicle records.
 *  3. Gives open driver jobs the Driver ID the app needs to read them.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
if (!raw) {
  console.error("FIREBASE_SERVICE_ACCOUNT is not set.");
  process.exit(1);
}
const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
initializeApp({ credential: cert(JSON.parse(json)) });
const db = getFirestore();
const apply = process.argv.includes("--apply");
console.log(apply ? "APPLYING changes." : "Dry run, nothing will be written.");

// Must match normalizePhoneNumber() in src/lib/phone-utils.ts
function normalise(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if ((digits.startsWith("0094") && digits.length >= 13) || (digits.startsWith("94") && digits.length >= 11)) {
    return `0${digits.slice(-9)}`;
  }
  return digits.length === 9 && !digits.startsWith("0") ? `0${digits}` : digits;
}
const plateKey = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function change(label, ref, patch) {
  console.log(`  ${apply ? "update" : "would update"} ${ref.path}: ${label}`);
  if (apply) await ref.update(patch);
}

for (const name of ["bookings", "payment_slips"]) {
  for (const doc of (await db.collection(name).get()).docs) {
    const data = doc.data();
    const phone = normalise(data.customerPhone || data.phone);
    if (phone && phone !== data.customerPhone) await change("customer phone format", doc.ref, { customerPhone: phone });
  }
}

for (const name of ["lorries", "lorries_live", "lorries_registry"]) {
  for (const doc of (await db.collection(name).get()).docs) {
    if (doc.data().ownerIdNumber !== undefined) {
      await change("remove owner NIC", doc.ref, { ownerIdNumber: FieldValue.delete() });
    }
  }
}

const drivers = (await db.collection("drivers").get()).docs;
for (const doc of (await db.collection("dispatches").get()).docs) {
  const job = doc.data();
  if (job.driverId || ["completed", "cancelled", "declined"].includes(job.status)) continue;
  const match = drivers.find((d) => plateKey(d.data().plate) && plateKey(d.data().plate) === plateKey(job.assignedPlate));
  if (match) await change("add driver ID", doc.ref, { driverId: match.data().driverId || match.id });
  else console.log(`  no driver found for ${doc.ref.path}; reassign it from the dashboard`);
}
console.log("Done.");
