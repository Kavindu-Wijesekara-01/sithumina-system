export function normalizePhoneNumber(raw?: string | null): string {
  const digits = String(raw || "").replace(/[^0-9]/g, "");
  if (!digits) return "";

  if ((digits.startsWith("0094") && digits.length >= 13) || (digits.startsWith("94") && digits.length >= 11)) {
    return `0${digits.slice(-9)}`;
  }

  if (digits.length === 9 && !digits.startsWith("0")) {
    return `0${digits}`;
  }

  return digits;
}

export function phonesMatch(a?: string | null, b?: string | null): boolean {
  const normA = normalizePhoneNumber(a);
  const normB = normalizePhoneNumber(b);
  if (!normA || !normB) return false;

  if (normA.length >= 9 && normB.length >= 9) {
    return normA.slice(-9) === normB.slice(-9);
  }

  return normA === normB;
}

export function getCanonicalCustomerId(phone: string): string {
  const normalized = normalizePhoneNumber(phone);
  if (normalized) {
    return `CUST-${normalized}`;
  }
  const fallback = String(phone || "").trim().replace(/[^a-zA-Z0-9]/g, "");
  return `CUST-${fallback || "GUEST"}`;
}

export function normalizePlate(raw?: string | null): string {
  return String(raw || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

