"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  loginOutsideEmployeeAction,
  toggleOutsideDutyAction,
  submitOutsideTopupSlipAction,
  getAllTopupSlipsAction,
} from "@/actions";
import {
  StoredOutsideEmployee,
  StoredCommissionTransaction,
  StoredTopupSlip,
} from "@/lib/server-store";
import {
  BankAccountSetting,
  subscribePaymentBankAccounts,
  DEFAULT_DUMMY_BANK_ACCOUNTS,
} from "@/lib/payment-settings";

interface EmployeePortalProps {
  locale: string;
}

const LOCAL_STORAGE_EMP_KEY = "sithumina_outside_employee_session";

export default function EmployeePortal({ locale }: EmployeePortalProps) {
  const [employee, setEmployee] = useState<StoredOutsideEmployee | null>(null);
  const [transactions, setTransactions] = useState<StoredCommissionTransaction[]>([]);
  const [slips, setSlips] = useState<StoredTopupSlip[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountSetting[]>(DEFAULT_DUMMY_BANK_ACCOUNTS);
  const [copiedBankId, setCopiedBankId] = useState<string | null>(null);

  // Login form state
  const [nicInput, setNicInput] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Duty toggle state
  const [dutyLoading, setDutyLoading] = useState(false);

  // Topup state
  const [topupAmount, setTopupAmount] = useState("5000");
  const [topupBank, setTopupBank] = useState("Bank of Ceylon (BOC)");
  const [topupSlipImage, setTopupSlipImage] = useState<string>("");
  const [topupSubmitting, setTopupSubmitting] = useState(false);
  const [topupFeedback, setTopupFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Hydrate session from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_EMP_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as StoredOutsideEmployee;
        if (parsed?.idNumber) {
          setEmployee(parsed);
          void refreshEmployeeData(parsed.idNumber);
        }
      }
    } catch {}

    const unsub = subscribePaymentBankAccounts((accs) => {
      if (accs && accs.length > 0) {
        setBankAccounts(accs.filter((a) => a.active));
      }
    });
    return () => unsub();
  }, []);

  const refreshEmployeeData = async (idNum: string) => {
    try {
      const res = await loginOutsideEmployeeAction(idNum);
      if (res.success && res.data) {
        setEmployee(res.data.employee);
        setTransactions(res.data.transactions || []);
        try {
          localStorage.setItem(LOCAL_STORAGE_EMP_KEY, JSON.stringify(res.data.employee));
        } catch {}
      }
      // load slips
      const slipsRes = await getAllTopupSlipsAction();
      if (slipsRes.success && slipsRes.data) {
        setSlips(
          slipsRes.data.filter(
            (s) =>
              (s.idNumber || "").trim().toLowerCase() === idNum.trim().toLowerCase()
          )
        );
      }
    } catch (e) {
      console.warn("Could not refresh employee data:", e);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNic = nicInput.trim();
    if (!cleanNic) {
      setLoginError(
        locale === "en"
          ? "Please enter your National ID Number (NIC)."
          : "කරුණාකර ඔබගේ ජාතික හැඳුනුම්පත් අංකය ඇතුළත් කරන්න."
      );
      return;
    }

    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await loginOutsideEmployeeAction(cleanNic);
      if (res.success) {
        if (res.data) {
          setEmployee(res.data.employee);
          setTransactions(res.data.transactions || []);
          try {
            localStorage.setItem(LOCAL_STORAGE_EMP_KEY, JSON.stringify(res.data.employee));
          } catch {}
          void refreshEmployeeData(cleanNic);
        }
      } else {
        setLoginError(
          res.error ||
            (locale === "en"
              ? "No registered outside vehicle owner found with this ID Number. Make sure your lorry registration is approved by Admin."
              : "මෙම හැඳුනුම්පත් අංකයට අදාළ ලියාපදිංචියක් හමු නොවීය. කරුණාකර ඔබගේ වාහන ලියාපදිංචිය Admin විසින් අනුමත (Approve) කර ඇත්දැයි තහවුරු කරගන්න.")
        );
      }
    } catch {
      setLoginError(
        locale === "en"
          ? "Failed to log in. Please check your connection."
          : "පිවිසීම අසාර්ථක විය. කරුණාකර නැවත උත්සාහ කරන්න."
      );
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setEmployee(null);
    setTransactions([]);
    setSlips([]);
    setNicInput("");
    try {
      localStorage.removeItem(LOCAL_STORAGE_EMP_KEY);
    } catch {}
  };

  const handleToggleDuty = async () => {
    if (!employee || dutyLoading) return;
    const targetStatus = !employee.isAvailable;
    setDutyLoading(true);
    try {
      const res = await toggleOutsideDutyAction(employee.idNumber, targetStatus);
      if (res.success) {
        const updated = { ...employee, isAvailable: res.data.isAvailable };
        setEmployee(updated);
        try {
          localStorage.setItem(LOCAL_STORAGE_EMP_KEY, JSON.stringify(updated));
        } catch {}
      } else {
        alert(res.error || "Failed to update availability status.");
      }
    } catch {
      alert("Failed to update status.");
    } finally {
      setDutyLoading(false);
    }
  };

  const handleSlipFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setTopupSlipImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    const amt = Number(topupAmount);
    if (!amt || amt <= 0) {
      alert(locale === "en" ? "Enter a valid amount." : "වලංගු මුදලක් ඇතුළත් කරන්න.");
      return;
    }
    if (!topupSlipImage) {
      alert(locale === "en" ? "Please upload your bank deposit slip." : "කරුණාකර බැංකු රිසිට්පත Upload කරන්න.");
      return;
    }

    setTopupSubmitting(true);
    setTopupFeedback(null);
    try {
      const res = await submitOutsideTopupSlipAction({
        idNumber: employee.idNumber,
        amount: amt,
        bankUsed: topupBank,
        slipUrl: topupSlipImage,
      });

      if (res.success) {
        setTopupFeedback({
          type: "success",
          msg:
            locale === "en"
              ? "Top-up slip submitted successfully! Admin will verify and credit your balance shortly."
              : "Top-up රිසිට්පත සාර්ථකව යොමු විය! Admin විසින් පරීක්ෂා කර ඔබගේ ශේෂයට මුදල් එක් කරනු ඇත.",
        });
        setTopupSlipImage("");
        void refreshEmployeeData(employee.idNumber);
      } else {
        setTopupFeedback({
          type: "error",
          msg: res.error || "Failed to submit top-up slip.",
        });
      }
    } catch {
      setTopupFeedback({
        type: "error",
        msg: "Failed to submit top-up slip.",
      });
    } finally {
      setTopupSubmitting(false);
    }
  };

  const handleCopyAccount = (id: string, num: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(num.replace(/\s+/g, ""));
      setCopiedBankId(id);
      setTimeout(() => setCopiedBankId(null), 2000);
    }
  };

  const formatDate = (ms: number) => {
    if (!ms) return "";
    return new Date(ms).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // -------------------------------------------------------------
  // VIEW A: NOT LOGGED IN (Employee Login Form)
  // -------------------------------------------------------------
  if (!employee) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6 items-start">
        <div className="md:col-span-7 bg-[var(--card)] rounded-3xl border border-[var(--line)] p-6 sm:p-8 shadow-xs">
          <div className="flex items-center gap-3.5 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-[#26231B] text-[#FFC20E] flex items-center justify-center shadow-xs flex-shrink-0">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16,8 20,8 23,11 23,16 16,16 16,8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-[var(--ink)]">
                {locale === "en"
                  ? "Employee & Outside Lorry Owner Sign In"
                  : "සේවක / වාහන හිමිකරු පිවිසුම (Employee Login)"}
              </h2>
              <p className="text-xs text-[var(--mut)] mt-0.5">
                {locale === "en"
                  ? "Sign in using your National ID Number (NIC) registered with Sithumina"
                  : "ලියාපදිංචි කිරීමේදී ලබාදුන් ජාතික හැඳුනුම්පත් අංකය (ID Number) ඇතුළත් කරන්න"}
              </p>
            </div>
          </div>

          {loginError && (
            <div className="p-4 mb-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 font-bold leading-relaxed">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-extrabold text-[var(--ink)] mb-1.5 flex items-center justify-between">
                <span>
                  {locale === "en" ? "National ID Number (NIC) *" : "ජාතික හැඳුනුම්පත් අංකය (ID Number) *"}
                </span>
                <span className="text-[10px] text-amber-600 font-bold">Required to access portal</span>
              </label>
              <input
                type="text"
                required
                placeholder={
                  locale === "en"
                    ? "e.g. 199012345678 or 901234567V"
                    : "උදා: 199012345678 හෝ 901234567V"
                }
                value={nicInput}
                onChange={(e) => setNicInput(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm text-[var(--ink)] font-mono uppercase focus:outline-none focus:border-[#FFC20E] transition-colors"
              />
              <p className="text-[11px] text-[var(--mut)] mt-1.5">
                {locale === "en"
                  ? "Use the NIC you entered when submitting the /register-vehicle form."
                  : "වාහනය ලියාපදිංචි කිරීමේදී ලබාදුන් ජාතික හැඳුනුම්පත් අංකය ඇතුළත් කරන්න."}
              </p>
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="mt-2 w-full py-3.5 rounded-xl bg-[#26231B] hover:bg-[#1a1813] text-[#FFC20E] text-sm font-black border-0 cursor-pointer active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
            >
              {loggingIn ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#FFC20E] border-t-transparent rounded-full animate-spin" />
                  <span>{locale === "en" ? "Authenticating..." : "තහවුරු වෙමින් පවතී..."}</span>
                </>
              ) : (
                <span>{locale === "en" ? "Sign In to Employee Portal" : "සේවක ගිණුමට ඇතුල් වන්න"}</span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[var(--line)] flex flex-col gap-2 text-xs text-[var(--mut)]">
            <span className="font-bold text-[var(--ink)]">
              {locale === "en" ? "Haven't registered your outside lorry yet?" : "ඔබගේ ලොරිය තවමත් ලියාපදිංචි කර නැද්ද?"}
            </span>
            <p>
              {locale === "en"
                ? "Register your outside vehicle with a Rs. 5,000 security deposit to start receiving cargo bookings."
                : "රු. 5,000 ආරම්භක තැන්පතුව සමඟ ඔබගේ ලොරිය පද්ධතියට එක් කර Bookings ලබාගන්න."}
            </p>
            <Link
              href="/register-vehicle"
              className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-[#b8860b] hover:underline"
            >
              <span>{locale === "en" ? "Go to Vehicle Registration →" : "වාහන ලියාපදිංචි පෝරමය වෙත යන්න →"}</span>
            </Link>
          </div>
        </div>

        {/* Informational Side Card */}
        <div className="md:col-span-5 bg-[var(--card)] rounded-3xl border border-[var(--line)] p-6 shadow-xs flex flex-col gap-4">
          <h3 className="text-sm font-black text-[var(--ink)] uppercase tracking-wide">
            {locale === "en" ? "Outside Lorry Operations" : "පිටින් සම්බන්ධ ලොරි ක්‍රමවේදය"}
          </h3>
          <div className="flex flex-col gap-3 text-xs text-[var(--mut)] leading-relaxed">
            <div className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--line)] flex flex-col gap-1">
              <span className="font-bold text-[var(--ink)]">1. Rs. 5,000 Deposit</span>
              <p>
                {locale === "en"
                  ? "Every partner starts with an initial deposit of Rs. 5,000 upon Admin approval."
                  : "Admin විසින් අනුමත කළ පසු රු. 5,000 ආරම්භක ශේෂයක් ඔබගේ ගිණුමට ලැබේ."}
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--line)] flex flex-col gap-1">
              <span className="font-bold text-[var(--ink)]">2. 20% Commission per Booking</span>
              <p>
                {locale === "en"
                  ? "When a hire is confirmed, 20% commission is deducted automatically from your balance."
                  : "Hire එකක් Confirm වූ පසු එම මුළු මුදලින් 20%ක කොමිස් මුදලක් ශේෂයෙන් කැපේ."}
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--line)] flex flex-col gap-1">
              <span className="font-bold text-[var(--ink)]">3. Duty Availability Toggle</span>
              <p>
                {locale === "en"
                  ? "Easily toggle Available / Unavailable anytime to stop or resume customer bookings."
                  : "ඔබට ඕනෑම වේලාවක Available / Unavailable මාරු කර සේවය පාලනය කළ හැකිය."}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW B: LOGGED IN (Employee Dashboard)
  // -------------------------------------------------------------
  const isBalanceLow = employee.balance < 2000;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Header Profile & Duty Status Card */}
      <div className="p-6 sm:p-7 rounded-3xl bg-[var(--card)] border border-[var(--line)] shadow-xs flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-[#26231B] text-[#FFC20E] flex items-center justify-center font-black text-xl shadow-xs shrink-0">
              {employee.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-[var(--ink)]">{employee.name}</h2>
                <span className="px-2 py-0.5 rounded-md bg-[#26231B] text-[#FFC20E] font-mono text-xs font-black">
                  {employee.id}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--mut)] mt-1 flex-wrap">
                <span>Plate: <strong className="text-[var(--ink)] font-mono">{employee.plateNumber}</strong></span>
                <span>•</span>
                <span>Type: <strong className="text-[var(--ink)]">{employee.vehicleType}</strong></span>
                <span>•</span>
                <span>Base: <strong className="text-[var(--ink)]">{employee.baseCity}</strong></span>
                <span>•</span>
                <span>NIC: <strong className="text-[var(--ink)] font-mono">{employee.idNumber}</strong></span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="px-4 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] hover:bg-rose-50 hover:text-rose-700 text-xs font-bold text-[var(--ink)] transition-colors cursor-pointer self-start sm:self-center"
          >
            {locale === "en" ? "Sign Out" : "ඉවත්වන්න"}
          </button>
        </div>

        {/* Duty Availability Toggle (Tick / Switch) */}
        <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={employee.isAvailable}
                onChange={handleToggleDuty}
                disabled={dutyLoading}
                className="sr-only peer"
              />
              <div className="w-12 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
            <div className="flex flex-col">
              <span className="text-xs font-extrabold text-[var(--ink)] flex items-center gap-2">
                <span>{locale === "en" ? "Duty Availability Status:" : "සේවයට සූදානම් තත්ත්වය (Duty Status):"}</span>
                {employee.isAvailable ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
                    🟢 {locale === "en" ? "Available / සේවයට සූදානම්" : "Available / සේවයට සූදානම්"}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black">
                    ⚪ {locale === "en" ? "Unavailable / සේවය අත්හිටුවා ඇත" : "Unavailable / තාවකාලිකව සේවයෙන් බැහැරයි"}
                  </span>
                )}
              </span>
              <span className="text-[11px] text-[var(--mut)] mt-0.5">
                {employee.isAvailable
                  ? locale === "en"
                    ? "Your vehicle is currently visible and bookable by customers in Individual Lorry."
                    : "ඔබගේ වාහනය පද්ධතියේ Available ලෙස සටහන්ව ඇති අතර පාරිභෝගිකයින්ට වෙන්කරවා ගත හැකිය."
                  : locale === "en"
                    ? "Your vehicle is temporarily hidden from booking until you turn duty back on."
                    : "ඔබ Unavailable කර ඇති බැවින් වෙබ් අඩවියේ පාරිභෝගිකයින්ට මෙම වාහනය Unavailable ලෙස පෙන්වයි."}
              </span>
            </div>
          </div>

          <div className="text-[11px] font-mono text-[var(--mut)] shrink-0">
            {dutyLoading ? "Updating..." : "Click toggle to change status"}
          </div>
        </div>
      </div>

      {/* 2. Wallet & Balance Overview Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Balance Card */}
        <div className={`p-6 rounded-3xl bg-[var(--card)] border ${isBalanceLow ? "border-amber-400" : "border-[var(--line)]"} shadow-xs flex flex-col justify-between`}>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--mut)] block">
              {locale === "en" ? "Current Wallet Balance" : "දැනට ඉතිරිව ඇති මුදල් ශේෂය"}
            </span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-xs font-bold text-[var(--mut)]">LKR</span>
              <span className="text-3xl font-black text-[var(--ink)]">
                {employee.balance.toLocaleString()}
                <span className="text-base font-normal text-[var(--mut)]">.00</span>
              </span>
            </div>
            <div className="mt-2">
              {isBalanceLow ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 text-xs font-bold">
                  ⚠️ Low Balance / ශේෂය ප්‍රමාණවත් නොවේ
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 text-xs font-bold">
                  ✓ Healthy Balance / ප්‍රමාණවත් ශේෂයක් පවතී
                </span>
              )}
            </div>
          </div>
          <p className="text-[11px] text-[var(--mut)] mt-4 pt-3 border-t border-[var(--line)]">
            Started with initial Rs. 5,000 security deposit.
          </p>
        </div>

        {/* Completed Hires */}
        <div className="p-6 rounded-3xl bg-[var(--card)] border border-[var(--line)] shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--mut)] block">
              {locale === "en" ? "Completed Hires" : "සම්පූර්ණ වූ ගමන් වාර"}
            </span>
            <div className="mt-2 text-3xl font-black text-[var(--ink)]">
              {employee.totalHiresCompleted || 0}
            </div>
          </div>
          <p className="text-[11px] text-[var(--mut)] mt-4 pt-3 border-t border-[var(--line)]">
            Total cargo trips executed through Sithumina system.
          </p>
        </div>

        {/* Commission Deducted */}
        <div className="p-6 rounded-3xl bg-[var(--card)] border border-[var(--line)] shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--mut)] block">
              {locale === "en" ? "Total 20% Commission Deducted" : "අයවූ මුළු 20% කොමිස් මුදල"}
            </span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-xs font-bold text-[var(--mut)]">LKR</span>
              <span className="text-3xl font-black text-[#5B4300]">
                {(employee.totalCommissionDeducted || 0).toLocaleString()}
                <span className="text-base font-normal text-[var(--mut)]">.00</span>
              </span>
            </div>
          </div>
          <p className="text-[11px] text-[var(--mut)] mt-4 pt-3 border-t border-[var(--line)]">
            Calculated as 20% on each confirmed hire value.
          </p>
        </div>
      </div>

      {/* Low Balance Warning Banner */}
      {isBalanceLow && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs leading-relaxed">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">⚠️</span>
            <div>
              <strong className="block text-sm font-bold text-amber-900">
                {locale === "en" ? "Notice: Wallet Balance Low" : "දැනුම්දීම: මුදල් ශේෂය අවම මට්ටමක පවතී"}
              </strong>
              <span>
                {locale === "en"
                  ? "When an incoming hire arrives, if your balance cannot cover the 20% commission (e.g. Rs. 2,000 for a Rs. 10,000 hire), new bookings will be paused. Please top up below."
                  : "අලුතින් එන Hire එකක 20% කොමිස් මුදල කැපීමට තරම් මුදල් ගිණුමේ නොමැති නම් (උදා: රු. 10,000ක Hire එකකට රු. 2,000ක ශේෂයක් නැතිනම්), නව Bookings ලබාගත නොහැක. කරුණාකර පහතින් Top-up කරන්න."}
              </span>
            </div>
          </div>
          <a
            href="#topup-section"
            className="px-4 py-2 rounded-xl bg-[#26231B] text-[#FFC20E] font-bold text-xs shrink-0 self-start sm:self-center no-underline"
          >
            {locale === "en" ? "Top Up Now ↓" : "මුදල් තැන්පත් කරන්න ↓"}
          </a>
        </div>
      )}

      {/* 3. Top-up Section (නැවත මුදල් තැන්පත් කිරීම) */}
      <div id="topup-section" className="p-6 sm:p-8 rounded-3xl bg-[var(--card)] border border-[var(--line)] shadow-xs flex flex-col gap-5">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--line)] flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">💳</span>
            <div>
              <h3 className="text-base font-black text-[var(--ink)]">
                {locale === "en"
                  ? "Wallet Top-up & Bank Slip Upload"
                  : "මුදල් නැවත තැන්පත් කිරීම (Top-up) සහ රිසිට්පත් Upload කිරීම"}
              </h3>
              <p className="text-xs text-[var(--mut)]">
                {locale === "en"
                  ? "Transfer funds to company bank accounts and upload the deposit receipt."
                  : "ආයතනයේ බැංකු ගිණුමට මුදල් තැන්පත් කර එම බැංකු රිසිට්පත (Bank Slip) මෙහි Upload කරන්න."}
              </p>
            </div>
          </div>
        </div>

        {/* Company Bank Accounts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {bankAccounts.map((acc) => (
            <div
              key={acc.id}
              className="p-3.5 rounded-2xl border border-[var(--line)] bg-[var(--bg)] flex flex-col gap-1 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-[var(--ink)]">{acc.bankName}</span>
                <span className="text-[10px] text-[var(--mut)]">{acc.branch}</span>
              </div>
              <span className="text-[11px] text-[var(--mut)]">Acc Name: {acc.accountName}</span>
              <div className="flex items-center justify-between mt-1 pt-1 border-t border-[var(--line)]/50">
                <span className="font-mono font-bold text-sm text-[var(--ink)]">{acc.accountNumber}</span>
                <button
                  type="button"
                  onClick={() => handleCopyAccount(acc.id, acc.accountNumber)}
                  className="px-2.5 py-0.5 rounded-lg bg-[var(--card)] border border-[var(--line)] hover:bg-[var(--y)] text-[10px] font-bold text-[var(--ink)] cursor-pointer transition-colors"
                >
                  {copiedBankId === acc.id ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Feedback message */}
        {topupFeedback && (
          <div
            className={`p-4 rounded-2xl text-xs font-bold leading-relaxed ${
              topupFeedback.type === "success"
                ? "bg-emerald-50 border border-emerald-300 text-emerald-900"
                : "bg-rose-50 border border-rose-300 text-rose-900"
            }`}
          >
            {topupFeedback.msg}
          </div>
        )}

        {/* Top-up Form */}
        <form onSubmit={handleSubmitTopup} className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[var(--ink)]">
              {locale === "en" ? "Top-up Amount (LKR) *" : "තැන්පත් කළ මුදල (රු.) *"}
            </label>
            <input
              type="number"
              min="500"
              step="500"
              required
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] font-mono font-bold focus:outline-none focus:border-[#FFC20E]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[var(--ink)]">
              {locale === "en" ? "Bank Transferred To" : "තැන්පත් කළ බැංකුව"}
            </label>
            <select
              value={topupBank}
              onChange={(e) => setTopupBank(e.target.value)}
              className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[#FFC20E] cursor-pointer"
            >
              {bankAccounts.map((b) => (
                <option key={b.id} value={`${b.bankName} - ${b.branch}`}>
                  {b.bankName} ({b.branch})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[var(--ink)]">
              {locale === "en" ? "Bank Slip Screenshot / Photo *" : "බැංකු රිසිට්පත (Bank Slip) *"}
            </label>
            {topupSlipImage ? (
              <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-emerald-400">
                <span className="text-xs text-emerald-800 font-bold truncate">✓ Slip attached</span>
                <button
                  type="button"
                  onClick={() => setTopupSlipImage("")}
                  className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                >
                  Change
                </button>
              </div>
            ) : (
              <label className="p-2.5 rounded-xl border-2 border-dashed border-[var(--line)] hover:border-[#FFC20E] flex items-center justify-center gap-1.5 text-xs text-[var(--ink)] font-bold cursor-pointer bg-white transition-colors">
                <span>📎 Upload Slip</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleSlipFileUpload}
                />
              </label>
            )}
          </div>

          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={topupSubmitting}
              className="py-3 px-6 rounded-xl bg-[#26231B] hover:bg-[#1a1813] text-[#FFC20E] font-black text-xs cursor-pointer transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {topupSubmitting ? "Submitting Top-up Slip..." : "Submit Top-up Slip for Admin Approval / රිසිට්පත යොමු කරන්න"}
            </button>
          </div>
        </form>

        {/* Uploaded Slips History */}
        {slips.length > 0 && (
          <div className="flex flex-col gap-2 pt-3 border-t border-[var(--line)]">
            <span className="text-xs font-bold text-[var(--ink)]">Recent Top-up Slips:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {slips.map((s) => (
                <div
                  key={s.id}
                  className="p-3 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    {s.slipUrl && (
                      <img src={s.slipUrl} alt="Slip" className="w-8 h-8 rounded object-cover border border-[var(--line)]" />
                    )}
                    <div className="flex flex-col">
                      <span className="font-bold text-[var(--ink)]">LKR {s.amount.toLocaleString()}</span>
                      <span className="text-[10px] text-[var(--mut)]">{formatDate(s.createdAt)}</span>
                    </div>
                  </div>
                  <div>
                    {s.status === "approved" ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        ✓ Approved &amp; Credited
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold">
                        ⏳ Pending Admin Review
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Commission Deductions & Transaction Ledger (කොමිස් අඩු වූ ආකාරය) */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[var(--card)] border border-[var(--line)] shadow-xs flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--line)] flex-wrap gap-2">
          <div>
            <h3 className="text-base font-black text-[var(--ink)]">
              {locale === "en"
                ? "Commission Deductions & Balance Ledger"
                : "කොමිස් අඩු වූ ආකාරය සහ ගිණුම් විස්තරය"}
            </h3>
            <p className="text-xs text-[var(--mut)]">
              {locale === "en"
                ? "Full log of 20% deductions per confirmed booking and credited top-ups."
                : "තහවුරු වූ සෑම Booking එකක් සඳහාම 20% කොමිස් අඩු වූ ආකාරය සහ Top-up සටහන්."}
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-[var(--mut)]">
            {transactions.length} Transactions
          </span>
        </div>

        {transactions.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--mut)] bg-[var(--bg)] rounded-2xl border border-[var(--line)]">
            No transactions recorded yet. Initial Rs. 5,000 security deposit is active.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {transactions.map((tx) => {
              const isDeduction = tx.type === "commission_deduction" || tx.amount < 0;
              return (
                <div
                  key={tx.id}
                  className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                        isDeduction
                          ? "bg-rose-100 text-rose-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {isDeduction ? "−" : "+"}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-[var(--ink)]">
                        {tx.note || (isDeduction ? `20% Commission for ${tx.bookingId || "Booking"}` : "Balance Credit")}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-[var(--mut)] flex-wrap mt-0.5">
                        <span>{formatDate(tx.createdAt)}</span>
                        {tx.bookingId && (
                          <span className="font-mono bg-[var(--card)] px-1.5 py-0.2 rounded border border-[var(--line)]">
                            Ref: {tx.bookingId}
                          </span>
                        )}
                        {tx.hireAmount ? (
                          <span>Hire Total: LKR {Number(tx.hireAmount).toLocaleString()}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center text-right shrink-0">
                    <span
                      className={`text-sm font-black font-mono ${
                        isDeduction ? "text-rose-700" : "text-emerald-700"
                      }`}
                    >
                      {isDeduction ? "-" : "+"} LKR {Math.abs(tx.amount).toLocaleString()}.00
                    </span>
                    <span className="text-[10px] font-mono text-[var(--mut)]">
                      Bal After: LKR {tx.balanceAfter?.toLocaleString() || 0}.00
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
