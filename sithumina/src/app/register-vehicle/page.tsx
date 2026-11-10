"use client";

import React, { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { registerVehicleAction } from "@/actions";

export default function RegisterVehiclePage() {
  const { locale } = useLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [docsConfirmed, setDocsConfirmed] = useState(false);
  const [form, setForm] = useState({
    ownerName: "",
    phone: "",
    plateNumber: "",
    vehicleType: "",
    baseCity: "",
    driverCount: "1",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docsConfirmed) {
      alert(
        locale === "en"
          ? "Please confirm that you will send the required documents via WhatsApp."
          : "කරුණාකර අවශ්‍ය ලියකියවිලි WhatsApp මඟින් එවන බව තහවුරු කරන්න."
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await registerVehicleAction({
        ownerName: form.ownerName,
        phone: form.phone,
        plateNumber: form.plateNumber,
        vehicleType: form.vehicleType,
        baseCity: form.baseCity,
        driverCount: form.driverCount,
      });

      if (res.success) {
        setSubmittedId(res.data.id);
        setDocsConfirmed(false);
        setForm({
          ownerName: "",
          phone: "",
          plateNumber: "",
          vehicleType: "",
          baseCity: "",
          driverCount: "1",
        });
      } else {
        alert(
          res.error ||
          (locale === "en"
            ? "Failed to save registration to database. Please call our hotline."
            : "ලියාපදිංචිය සුරැකීමට නොහැකි විය. කරුණාකර දුරකථනයෙන් අමතන්න.")
        );
      }
    } catch (err) {
      console.error("Registration error:", err);
      alert(
        locale === "en"
          ? "Failed to save registration to database. Please call our hotline."
          : "ලියාපදිංචිය සුරැකීමට නොහැකි විය. කරුණාකර දුරකථනයෙන් අමතන්න."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="p-4 lg:p-[24px_32px] flex flex-col gap-6 max-w-3xl">
      <div className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--y3)] text-[#5B4300] text-xs font-bold w-fit border border-[var(--y2)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="15" height="13" />
            <polygon points="16,8 20,8 23,11 23,16 16,16 16,8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
          <span>{locale === "en" ? "Lorry Owner Network" : "ලොරි හිමියන් සඳහා"}</span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-extrabold text-[var(--ink)]">
          {locale === "en" ? "Register Your Vehicle" : "ඔබගේ ලොරිය ලියාපදිංචි කරන්න"}
        </h1>
        <p className="text-[var(--mut)] text-sm leading-relaxed">
          {locale === "en"
            ? "Own a vehicle or manage a transport fleet? Partner with Sithumina Transport to get consistent loads, eliminate empty return runs, and connect with customers across Sri Lanka."
            : "වාහනයක් සතු ඔබත් සිතුමිණ ට්‍රාන්ස්පෝර්ට් සමඟ එක්වී වැඩි ගමන් වාර සහ ආදායම් ලබාගන්න."}
        </p>
      </div>

      {submittedId ? (
        <div className="p-8 rounded-2xl bg-[var(--card)] border border-[#1E9E5A] flex flex-col items-center text-center gap-3 shadow-sm animate-in fade-in duration-300">
          <div className="w-14 h-14 rounded-full bg-[#DDF3E7] text-[#12663A] grid place-items-center text-2xl font-bold">
            ✓
          </div>
          <h2 className="text-xl font-extrabold text-[var(--ink)]">
            {locale === "en"
              ? "Registration Submitted to Fleet Database!"
              : "ලියාපදිංචි කිරීම සාර්ථකව පද්ධතියේ සටහන් විය!"}
          </h2>
          <div className="p-2.5 px-4 rounded-xl bg-[var(--bg)] border border-[var(--line)] text-xs font-mono text-[var(--ink)]">
            Registration Ref: <span className="font-bold text-[#1E9E5A]">{submittedId.slice(0, 10).toUpperCase()}</span>
          </div>
          <p className="text-sm text-[var(--mut)] max-w-md">
            {locale === "en"
              ? "Welcome to the Sithumina network! Our dispatch operations coordinator will review your lorry and approve it into the live fleet shortly."
              : "අපගේ නියෝජිතයෙකු ඔබ අමතා ලියකියවිලි තහවුරු කර සජීවී සිතියම වෙත ඔබගේ වාහනය එක්කරනු ඇත."}
          </p>
          <button
            onClick={() => setSubmittedId(null)}
            className="mt-2 px-5 py-2.5 rounded-xl bg-[var(--y)] text-[#26231B] font-bold text-xs cursor-pointer hover:opacity-90"
          >
            {locale === "en" ? "Register Another Lorry" : "තවත් වාහනයක් ඇතුළත් කරන්න"}
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="p-6 rounded-2xl bg-[var(--card)] border border-[var(--line)] shadow-xs flex flex-col gap-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[var(--ink)]">
                {locale === "en" ? "Owner / Company Name" : "හිමිකරුගේ නම"} *
              </label>
              <input
                required
                type="text"
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[#FFC20E]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[var(--ink)]">
                {locale === "en" ? "Contact Number" : "දුරකථන අංකය"} *
              </label>
              <input
                required
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[#FFC20E]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[var(--ink)]">
                {locale === "en" ? "Vehicle Number Plate" : "වාහන අංකය"} *
              </label>
              <input
                required
                type="text"
                value={form.plateNumber}
                onChange={(e) => setForm({ ...form, plateNumber: e.target.value })}
                className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[#FFC20E]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[var(--ink)]">
                {locale === "en" ? "Vehicle Type" : "වාහන වර්ගය"}
              </label>
              <input
                type="text"
                value={form.vehicleType}
                onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
                className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[#FFC20E]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[var(--ink)]">
                {locale === "en" ? "Operating Base City" : "ප්‍රධාන නගරය"} *
              </label>
              <input
                required
                type="text"
                value={form.baseCity}
                onChange={(e) => setForm({ ...form, baseCity: e.target.value })}
                className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[#FFC20E]"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--bg)] flex flex-col gap-2.5">
            <p className="text-xs text-[var(--ink)] leading-relaxed">
              {locale === "en"
                ? "Please send photos of the front and back of your ID card and a photo of your police certificate to WhatsApp number 0765550123."
                : "කරුණාකර ඔබගේ ජාතික හැඳුනුම්පතේ ඉදිරිපස සහ පසුපස ඡායාරූප ද, පොලිස් සහතිකයේ ඡායාරූපය ද 0765550123 යන WhatsApp අංකයට යොමු කරන්න."}
            </p>
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[var(--ink)] font-medium select-none">
              <input
                required
                type="checkbox"
                checked={docsConfirmed}
                onChange={(e) => setDocsConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[var(--line)] accent-[#FFC20E] cursor-pointer"
              />
              <span>
                {locale === "en"
                  ? "I confirm that I will send the front and back of my ID card and police certificate photos to 0765550123 via WhatsApp."
                  : "ජාතික හැඳුනුම්පතේ ඉදිරිපස සහ පසුපස ඡායාරූප ද, පොලිස් සහතිකයේ ඡායාරූපය ද 0765550123 අංකයට WhatsApp මඟින් එවන බව තහවුරු කරමි."}
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting || !docsConfirmed}
            className="mt-2 py-3.5 px-6 rounded-xl bg-[var(--y)] text-[#26231B] font-extrabold text-sm cursor-pointer hover:opacity-90 transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-[#26231B] border-t-transparent rounded-full animate-spin" />
                <span>
                  {locale === "en" ? "Submitting Registration..." : "ලියාපදිංචි වෙමින් පවතී..."}
                </span>
              </>
            ) : (
              <span>
                {locale === "en" ? "Submit Lorry Registration" : "ලියාපදිංචි කිරීම සම්පූර්ණ කරන්න"}
              </span>
            )}
          </button>
        </form>
      )}
    </main>
  );
}
