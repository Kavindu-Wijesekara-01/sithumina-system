/** Outside-owner wallet rules, shared by server and client code. */

export const REGISTRATION_DEPOSIT = 5000;
export const COMMISSION_PERCENT = 20;

export function commissionFor(hireAmount: number, percent: number = COMMISSION_PERCENT): number {
  return Math.round(((Number(hireAmount) || 0) * percent) / 100);
}

/** "Rs. 4,800" / "-Rs. 300" */
export function formatRs(amount: number): string {
  const value = Number(amount) || 0;
  return `${value < 0 ? "-" : ""}Rs. ${Math.abs(value).toLocaleString("en-US")}`;
}
