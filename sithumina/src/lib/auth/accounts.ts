/**
 * Server-side account management. Not a "use server" module: callers must apply
 * their own role checks.
 */
import { adminAuth } from "@/lib/firebase-admin";
import { loginEmail, passwordProblem, type Role } from "./identity";

export class AccountError extends Error {}

const errorCode = (e: unknown) => String((e as { code?: string })?.code || "");

/**
 * Create the account for an identifier, or reset its password if it exists.
 * Existing sessions are revoked whenever a password changes.
 */
export async function upsertAccount(input: {
  identifier: string;
  password: string;
  displayName?: string;
  claims: { role: Role; customerPhone?: string; driverId?: string };
  /** Refuse to touch an account that already exists (self-registration). */
  createOnly?: boolean;
}): Promise<string> {
  const email = loginEmail(input.identifier);
  if (!email) throw new AccountError("Enter a valid phone number or ID.");
  const problem = passwordProblem(input.password);
  if (problem) throw new AccountError(problem);

  const auth = adminAuth();
  let existing: string | null = null;
  try {
    existing = (await auth.getUserByEmail(email)).uid;
  } catch (e) {
    if (errorCode(e) !== "auth/user-not-found") throw e;
  }
  if (existing && input.createOnly) {
    throw new AccountError("An account already exists. Sign in, or ask the office to reset your password.");
  }

  const profile = { password: input.password, displayName: input.displayName || undefined, disabled: false };
  const uid = existing
    ? (await auth.updateUser(existing, profile)).uid
    : (await auth.createUser({ email, ...profile })).uid;
  await auth.setCustomUserClaims(uid, input.claims);
  if (existing) await auth.revokeRefreshTokens(uid);
  return uid;
}

export async function disableAccount(identifier: string): Promise<void> {
  const auth = adminAuth();
  try {
    const { uid } = await auth.getUserByEmail(loginEmail(identifier));
    await auth.updateUser(uid, { disabled: true });
    await auth.revokeRefreshTokens(uid);
  } catch (e) {
    if (errorCode(e) !== "auth/user-not-found") throw e;
  }
}
