/**
 * Create or reset an Admin sign-in. Run on a trusted computer only.
 *
 *   ADMIN_ID=ADMIN ADMIN_PASSWORD='a long password' \
 *     node --env-file=.env.local scripts/create-admin.mjs
 *
 * Needs FIREBASE_SERVICE_ACCOUNT. The password is read from the environment so
 * that it is never stored in the repository.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const id = (process.env.ADMIN_ID || "").trim();
const password = process.env.ADMIN_PASSWORD || "";
const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
if (!id || password.length < 12 || !raw) {
  console.error("Set ADMIN_ID, ADMIN_PASSWORD (12+ characters) and FIREBASE_SERVICE_ACCOUNT.");
  process.exit(1);
}

const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
initializeApp({ credential: cert(JSON.parse(json)) });
const auth = getAuth();

// Must match loginEmail() in src/lib/auth/identity.ts
const slug = id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
if (!slug || /^\+?[\d\s()-]{9,}$/.test(id)) {
  console.error("ADMIN_ID must be a name such as ADMIN, not a phone number.");
  process.exit(1);
}
const email = `id-${slug}@users.sithumina.app`;

let uid;
try {
  uid = (await auth.getUserByEmail(email)).uid;
  await auth.updateUser(uid, { password, disabled: false });
  await auth.revokeRefreshTokens(uid);
} catch (e) {
  if (e.code !== "auth/user-not-found") throw e;
  uid = (await auth.createUser({ email, password, displayName: id })).uid;
}
await auth.setCustomUserClaims(uid, { role: "admin" });
console.log(`Admin "${id}" is ready. Sign in with that ID and the password you set.`);
