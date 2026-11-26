/**
 * Sign-in is Phone number or ID plus a password (no SMS). Firebase Auth needs an
 * email address, so each identifier maps to a fixed synthetic one.
 *
 * Pure code with no imports. The Driver App keeps an identical copy at
 * sithumina_app/src/services/identity.ts - change both together.
 */

export type Role = "customer" | "driver" | "admin";

export const MIN_PASSWORD_LENGTH = 8;
const DOMAIN = "users.sithumina.app";

/** "+94 77 123 4567", "0771234567" and "771234567" are the same customer. */
export function phoneDigits(value: string): string {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : "";
}

export const looksLikePhone = (value: string) => /^\+?[\d\s()-]{9,}$/.test(String(value || "").trim());

export function loginEmail(identifier: string): string {
  const raw = String(identifier || "").trim();
  if (looksLikePhone(raw)) return `p${phoneDigits(raw)}@${DOMAIN}`;
  const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug ? `id-${slug}@${DOMAIN}` : "";
}

export function passwordProblem(password: string): string {
  if (String(password || "").length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (/^(\d)\1+$|^12345678/.test(password)) return "Choose a password that is harder to guess.";
  return "";
}
