"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { registerVehicleAction } from "@/actions";
import {
  BankAccountSetting,
  subscribePaymentBankAccounts,
  DEFAULT_DUMMY_BANK_ACCOUNTS,
} from "@/lib/payment-settings";
import { SRI_LANKA_CITIES } from "@/lib/sri-lanka-routes";

const VEHICLE_TYPE_PRESETS = [
  "10ft Light Lorry (දිග අඩි 10)",
  "14ft Lorry (දිග අඩි 14)",
  "14.5ft Demountable Box Lorry (පෙට්ටි ලොරිය)",
  "16ft Medium Lorry (දිග අඩි 16)",
  "20ft Container Lorry (කන්ටේනර් ලොරිය)",
  "Freezer / Cold Storage Lorry (ශීතකරණ ලොරිය)",
  "Maxi Lorry (මැක්සි ලොරිය)",
];

export default function RegisterVehiclePage() {
  const { locale } = useLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccountSetting[]>(DEFAULT_DUMMY_BANK_ACCOUNTS);
  const [copiedBankId, setCopiedBankId] = useState<string | null>(null);

  const [form, setForm] = useState({
    ownerName: "",
    phone: "",
    idNumber: "",
    plateNumber: "",
    vehicleType: VEHICLE_TYPE_PRESETS[1],
    baseCity: "Colombo",
    maxWeight: "3.5 Tons (3,500 kg)",
    capacity: "3 Tons Cargo Payload",
    dimensions: "14.5ft × 6.5ft × 7ft",
  });

  // 3 Vehicle Photos
  const [photoFront, setPhotoFront] = useState<string>("");
  const [photoSide, setPhotoSide] = useState<string>("");
  const [photoBack, setPhotoBack] = useState<string>("");

  // Deposit slip
  const [depositSlip, setDepositSlip] = useState<string>("");

  useEffect(() => {
    const unsub = subscribePaymentBankAccounts((accs) => {
      if (accs && accs.length > 0) {
        setBankAccounts(accs.filter((a) => a.active));
      }
    });
    return () => unsub();
  }, []);

  const handleCopyAccount = (id: string, num: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(num.replace(/\s+/g, ""));
      setCopiedBankId(id);
      setTimeout(() => setCopiedBankId(null), 2000);
    }
  };

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert(locale === "en" ? "Please select an image file." : "කරුණාකර ඡායාරූප ගොනුවක් තෝරන්න.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setter(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.idNumber.trim()) {
      alert(
        locale === "en"
          ? "National ID Number (NIC) is required."
          : "ජාතික හැඳුනුම්පත් අංකය (ID Number) අනිවාර්ය වේ."
      );
      return;
    }

    if (!photoFront && !photoSide && !photoBack) {
      alert(
        locale === "en"
          ? "Please upload at least 1-3 clear photos of your lorry."
          : "කරුණාකර ඔබගේ වාහනයේ පැහැදිලි ඡායාරූප ලබා දෙන්න."
      );
      return;
    }

    const imagesList = [photoFront, photoSide, photoBack].filter(Boolean);

    setSubmitting(true);
    try {
      const res = await registerVehicleAction({
        ownerName: form.ownerName,
        phone: form.phone,
        idNumber: form.idNumber,
        plateNumber: form.plateNumber,
        vehicleType: form.vehicleType,
        baseCity: form.baseCity,
        maxWeight: form.maxWeight,
        capacity: form.capacity,
        dimensions: form.dimensions,
        images: imagesList,
        depositSlipUrl: depositSlip,
        initialDepositAmount: 5000,
      });

      if (res.success) {
        setSubmittedId(res.data.id);
        setForm({
          ownerName: "",
          phone: "",
          idNumber: "",
          plateNumber: "",
          vehicleType: VEHICLE_TYPE_PRESETS[1],
          baseCity: "Colombo",
          maxWeight: "3.5 Tons (3,500 kg)",
          capacity: "3 Tons Cargo Payload",
          dimensions: "14.5ft × 6.5ft × 7ft",
        });
        setPhotoFront("");
        setPhotoSide("");
        setPhotoBack("");
        setDepositSlip("");
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
          ? "Failed to save registration. Please check your connection."
          : "ලියාපදිංචිය සුරැකීමට නොහැකි විය."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="p-4 lg:p-[24px_32px] flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Header Banner */}
      <div className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--y3)] text-[#5B4300] text-xs font-bold w-fit border border-[var(--y2)]">
          <svg
            width="14"
            height="14"
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
          <span>
            {locale === "en"
              ? "Outside Partner Lorries Registration"
              : "පිටින් සම්බන්ධ වන ලොරි (Outside Lorries) ලියාපදිංචිය"}
          </span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-black text-[var(--ink)]">
          {locale === "en" ? "Register Your Outside Lorry" : "ඔබගේ ලොරිය ලියාපදිංචි කරන්න"}
        </h1>
        <p className="text-[var(--mut)] text-sm leading-relaxed">
          {locale === "en"
            ? "Connect your outside lorry with Sithumina Transport to receive island-wide cargo bookings with an initial Rs. 5,000 security deposit and automatic 20% commission settlement per completed booking."
            : "සිතුමිණ ට්‍රාන්ස්පෝර්ට් පද්ධතිය සමඟ පිටින් සම්බන්ධ වන ලොරි හිමිකරුවන් සඳහා වන ලියාපදිංචි පෝරමය. ආරම්භක රු. 5,000 තැන්පතුව සහ ස්වයංක්‍රීය 20% කොමිස් ක්‍රමය යටතේ සෘජු Bookings ලබාගන්න."}
        </p>
      </div>

      {submittedId ? (
        <div className="p-8 sm:p-10 rounded-3xl bg-[var(--card)] border border-[#1E9E5A] flex flex-col items-center text-center gap-4 shadow-sm animate-in fade-in duration-300">
          <div className="w-16 h-16 rounded-full bg-[#DDF3E7] text-[#12663A] grid place-items-center text-3xl font-black">
            ✓
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)]">
            {locale === "en"
              ? "Lorry Registration Submitted for Admin Approval!"
              : "වාහන ලියාපදිංචිය සාර්ථකව පද්ධතියට යොමු විය!"}
          </h2>
          <div className="p-3 px-5 rounded-2xl bg-[var(--bg)] border border-[var(--line)] text-xs font-mono text-[var(--ink)]">
            Registration ID: <span className="font-bold text-[#1E9E5A]">{submittedId}</span>
          </div>
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 max-w-lg text-left flex flex-col gap-1.5">
            <span className="font-bold">
              {locale === "en" ? "Next Steps & Activation:" : "මීළඟ පියවර සහ සක්‍රීය කිරීම:"}
            </span>
            <p>
              {locale === "en"
                ? "1. Our Admin team will verify your vehicle specifications and Rs. 5,000 deposit slip."
                : "1. අපගේ පරිපාලක මණ්ඩලය (Admin) ඔබගේ වාහන විස්තර සහ රු. 5,000 තැන්පතු රිසිට්පත පරීක්ෂා කර අනුමත කරනු ඇත."}
            </p>
            <p>
              {locale === "en"
                ? "2. Upon approval, your vehicle is published to the live fleet with your base location."
                : "2. අනුමත වූ පසු, ඔබගේ වාහනය පද්ධතියේ 'Individual Lorry' කොටසට ඔබ ඇතුළත් කළ Base Location එක සමඟ එක් වේ."}
            </p>
            <p>
              {locale === "en"
                ? "3. You can log in to My Account → Employee Login using your National ID Number (NIC) to manage your balance, duty availability, and top-ups."
                : "3. ඔබගේ ජාතික හැඳුනුම්පත් අංකය (ID Number) භාවිත කර My Account → Employee Login ඔස්සේ පිවිස ශේෂය, Available/Unavailable තත්ත්වය සහ Top-up කළමනාකරණය කළ හැකිය."}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setSubmittedId(null)}
              className="px-5 py-2.5 rounded-xl bg-[var(--y)] text-[#26231B] font-bold text-xs cursor-pointer hover:opacity-90 shadow-xs"
            >
              {locale === "en" ? "Register Another Lorry" : "තවත් වාහනයක් ලියාපදිංචි කරන්න"}
            </button>
            <Link
              href="/login"
              className="px-5 py-2.5 rounded-xl bg-[var(--bg)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:bg-[var(--y3)] transition-all no-underline"
            >
              {locale === "en" ? "Go to Employee Login" : "Employee Login වෙත යන්න"}
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Section 1: Owner / Driver Information */}
          <div className="p-6 rounded-3xl bg-[var(--card)] border border-[var(--line)] shadow-xs flex flex-col gap-4">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--line)]">
              <span className="w-6 h-6 rounded-full bg-[var(--y)] text-[#26231B] font-black text-xs grid place-items-center">
                1
              </span>
              <h2 className="text-sm font-black text-[var(--ink)] uppercase tracking-wide">
                {locale === "en"
                  ? "Owner & Driver Details / අයිතිකරුගේ හා රියදුරුගේ විස්තර"
                  : "අයිතිකරුගේ / රියදුරුගේ විස්තර"}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[var(--ink)]">
                  {locale === "en" ? "Owner / Driver Full Name" : "හිමිකරුගේ / රියදුරුගේ නම"} *
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. S. M. Perera"
                  value={form.ownerName}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                  className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[#FFC20E]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[var(--ink)]">
                  {locale === "en" ? "Contact Mobile Phone" : "දුරකථන අංකය"} *
                </label>
                <input
                  required
                  type="tel"
                  placeholder="e.g. 07X XXX XXXX"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[#FFC20E]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[var(--ink)] flex items-center justify-between">
                  <span>{locale === "en" ? "National ID Number (NIC)" : "හැඳුනුම්පත් අංකය (ID)"} *</span>
                  <span className="text-[10px] text-amber-600 font-bold">Employee Login Key</span>
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. 199012345678 / 901234567V"
                  value={form.idNumber}
                  onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
                  className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[#FFC20E] font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Vehicle Specifications */}
          <div className="p-6 rounded-3xl bg-[var(--card)] border border-[var(--line)] shadow-xs flex flex-col gap-4">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--line)]">
              <span className="w-6 h-6 rounded-full bg-[var(--y)] text-[#26231B] font-black text-xs grid place-items-center">
                2
              </span>
              <h2 className="text-sm font-black text-[var(--ink)] uppercase tracking-wide">
                {locale === "en"
                  ? "Vehicle Specifications / වාහනයේ තාක්ෂණික විස්තර"
                  : "වාහනයේ විස්තර (Weight, Payload & Dimensions)"}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[var(--ink)]">
                  {locale === "en" ? "Vehicle Number Plate" : "වාහන අංකය"} *
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. WP LK-4521"
                  value={form.plateNumber}
                  onChange={(e) => setForm({ ...form, plateNumber: e.target.value.toUpperCase() })}
                  className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[#FFC20E] font-mono font-bold"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[var(--ink)]">
                  {locale === "en" ? "Vehicle Type" : "වාහන වර්ගය"} *
                </label>
                <select
                  value={form.vehicleType}
                  onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
                  className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[#FFC20E] cursor-pointer"
                >
                  {VEHICLE_TYPE_PRESETS.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[var(--ink)] flex items-center justify-between">
                  <span>{locale === "en" ? "Operation Base (City)" : "ප්‍රධාන නගරය (Base City)"} *</span>
                  <span className="text-[10px] text-[var(--mut)]">Outside Lorry Location</span>
                </label>
                <input
                  required
                  type="text"
                  list="sri-lanka-cities-list"
                  placeholder="e.g. Kandy, Galle, Kurunegala"
                  value={form.baseCity}
                  onChange={(e) => setForm({ ...form, baseCity: e.target.value })}
                  className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[#FFC20E]"
                />
                <datalist id="sri-lanka-cities-list">
                  {Object.keys(SRI_LANKA_CITIES).map((c) => {
                    const label = c.charAt(0).toUpperCase() + c.slice(1);
                    return <option key={c} value={label} />;
                  })}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[var(--ink)]">
                  {locale === "en" ? "Vehicle Max Gross Weight" : "වාහනයේ බර (Weight)"}
                </label>
                <input
                  type="text"
                  placeholder="e.g. 3.5 Tons (3,500 kg)"
                  value={form.maxWeight}
                  onChange={(e) => setForm({ ...form, maxWeight: e.target.value })}
                  className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[#FFC20E]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[var(--ink)]">
                  {locale === "en" ? "Max Payload / Capacity" : "උපරිම පැටවුම් ධාරිතාව (Payload)"}
                </label>
                <input
                  type="text"
                  placeholder="e.g. 3 Tons / 3000 kg"
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                  className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[#FFC20E]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[var(--ink)]">
                  {locale === "en" ? "Cargo Dimensions (L × W × H)" : "ලොරියේ මානයන් (Dimensions)"}
                </label>
                <input
                  type="text"
                  placeholder="e.g. 14.5ft × 6.5ft × 7ft"
                  value={form.dimensions}
                  onChange={(e) => setForm({ ...form, dimensions: e.target.value })}
                  className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[#FFC20E]"
                />
              </div>
            </div>
          </div>

          {/* Section 3: 3 Vehicle Photos Upload */}
          <div className="p-6 rounded-3xl bg-[var(--card)] border border-[var(--line)] shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line)] flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[var(--y)] text-[#26231B] font-black text-xs grid place-items-center">
                  3
                </span>
                <h2 className="text-sm font-black text-[var(--ink)] uppercase tracking-wide">
                  {locale === "en"
                    ? "Vehicle Photos (3 Required) / වාහනයේ ඡායාරූප 3ක්"
                    : "වාහනයේ ඡායාරූප 3ක් Upload කිරීම"}
                </h2>
              </div>
              <span className="text-[11px] text-[var(--mut)]">
                {locale === "en" ? "Front, Side & Rear/Cargo views" : "ඉදිරිපස, පැති සහ පිටුපස ඡායාරූප"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Photo 1: Front */}
              <div className="flex flex-col gap-2 p-3.5 rounded-2xl border border-[var(--line)] bg-[var(--bg)]">
                <span className="text-xs font-bold text-[var(--ink)]">
                  {locale === "en" ? "1. Front View (ඉදිරිපස)" : "1. ඉදිරිපස ඡායාරූපය"} *
                </span>
                {photoFront ? (
                  <div className="relative aspect-[4/3] rounded-xl overflow-hidden border border-[var(--line)] group">
                    <img src={photoFront} alt="Lorry Front" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotoFront("")}
                      className="absolute top-1.5 right-1.5 px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                    >
                      ✕ Remove
                    </button>
                  </div>
                ) : (
                  <label className="aspect-[4/3] rounded-xl border-2 border-dashed border-[var(--line)] hover:border-[#FFC20E] flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer p-3 transition-colors bg-white/50">
                    <span className="text-2xl">📸</span>
                    <span className="text-xs font-bold text-[var(--ink)]">
                      {locale === "en" ? "Upload Front Photo" : "ඉදිරිපස ඡායාරූපය"}
                    </span>
                    <span className="text-[10px] text-[var(--mut)]">PNG / JPG</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageUpload(e, setPhotoFront)}
                    />
                  </label>
                )}
              </div>

              {/* Photo 2: Side */}
              <div className="flex flex-col gap-2 p-3.5 rounded-2xl border border-[var(--line)] bg-[var(--bg)]">
                <span className="text-xs font-bold text-[var(--ink)]">
                  {locale === "en" ? "2. Side View (පැති පෙනුම)" : "2. පැති ඡායාරූපය"} *
                </span>
                {photoSide ? (
                  <div className="relative aspect-[4/3] rounded-xl overflow-hidden border border-[var(--line)] group">
                    <img src={photoSide} alt="Lorry Side" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotoSide("")}
                      className="absolute top-1.5 right-1.5 px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                    >
                      ✕ Remove
                    </button>
                  </div>
                ) : (
                  <label className="aspect-[4/3] rounded-xl border-2 border-dashed border-[var(--line)] hover:border-[#FFC20E] flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer p-3 transition-colors bg-white/50">
                    <span className="text-2xl">📸</span>
                    <span className="text-xs font-bold text-[var(--ink)]">
                      {locale === "en" ? "Upload Side Photo" : "පැති ඡායාරූපය"}
                    </span>
                    <span className="text-[10px] text-[var(--mut)]">PNG / JPG</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageUpload(e, setPhotoSide)}
                    />
                  </label>
                )}
              </div>

              {/* Photo 3: Rear / Cargo */}
              <div className="flex flex-col gap-2 p-3.5 rounded-2xl border border-[var(--line)] bg-[var(--bg)]">
                <span className="text-xs font-bold text-[var(--ink)]">
                  {locale === "en" ? "3. Cargo / Rear View (පිටුපස)" : "3. පිටුපස / භාණ්ඩ රඳවනය"} *
                </span>
                {photoBack ? (
                  <div className="relative aspect-[4/3] rounded-xl overflow-hidden border border-[var(--line)] group">
                    <img src={photoBack} alt="Lorry Rear" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotoBack("")}
                      className="absolute top-1.5 right-1.5 px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                    >
                      ✕ Remove
                    </button>
                  </div>
                ) : (
                  <label className="aspect-[4/3] rounded-xl border-2 border-dashed border-[var(--line)] hover:border-[#FFC20E] flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer p-3 transition-colors bg-white/50">
                    <span className="text-2xl">📸</span>
                    <span className="text-xs font-bold text-[var(--ink)]">
                      {locale === "en" ? "Upload Rear Photo" : "පිටුපස ඡායාරූපය"}
                    </span>
                    <span className="text-[10px] text-[var(--mut)]">PNG / JPG</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageUpload(e, setPhotoBack)}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Rs. 5,000 Security Deposit & 20% Commission Model */}
          <div className="p-6 rounded-3xl bg-[var(--card)] border border-[var(--line)] shadow-xs flex flex-col gap-4">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--line)]">
              <span className="w-6 h-6 rounded-full bg-[var(--y)] text-[#26231B] font-black text-xs grid place-items-center">
                4
              </span>
              <h2 className="text-sm font-black text-[var(--ink)] uppercase tracking-wide">
                {locale === "en"
                  ? "Rs. 5,000 Deposit & 20% Commission Terms / තැන්පතුව හා කොමිස් ක්‍රමය"
                  : "රු. 5,000 තැන්පතුව සහ 20% කොමිස් ක්‍රමය"}
              </h2>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col gap-2 text-xs text-amber-950">
              <div className="flex items-center gap-2 font-bold text-sm text-amber-900">
                <span>💰</span>
                <span>
                  {locale === "en"
                    ? "Initial Security Deposit: LKR 5,000.00"
                    : "මූලික තැන්පතුව: රු. 5,000.00"}
                </span>
              </div>
              <p className="leading-relaxed">
                {locale === "en"
                  ? "Every outside vehicle owner deposits Rs. 5,000 to activate their account. When you receive a confirmed hire through Sithumina Transport, a 20% commission is automatically deducted from this balance (e.g. Rs. 4,000 deducted on a Rs. 20,000 hire). If your balance falls below the 20% commission needed for incoming hires, new bookings will be paused until topped up."
                  : "පිටින් ලියාපදිංචි වන සෑම වාහන හිමිකරුවෙකුම රු. 5,000ක මුදලක් තැන්පත් කළ යුතුය. පද්ධතිය හරහා Hire එකක් තහවුරු වූ පසු, එම මුදලින් 20%ක කොමිස් මුදලක් ඔබගේ රු. 5,000 ශේෂයෙන් ස්වයංක්‍රීයව අඩු වේ (උදා: රු. 20,000ක Hire එකකින් රු. 4,000ක් අඩු වීම). ශේෂය ප්‍රමාණවත් නොවන විට අලුත් Bookings ලබාගැනීමට නැවත මුදල් තැන්පත් (Top-up) කළ යුතුය."}
              </p>
            </div>

            {/* Bank Accounts to Transfer Rs. 5,000 */}
            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-bold text-[var(--ink)]">
                {locale === "en"
                  ? "Transfer Rs. 5,000 to Company Bank Account:"
                  : "ආයතනයේ බැංකු ගිණුම් වෙත රු. 5,000 තැන්පත් කරන්න:"}
              </span>
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
                      <span className="font-mono font-bold text-sm text-[var(--ink)]">
                        {acc.accountNumber}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyAccount(acc.id, acc.accountNumber)}
                        className="px-2 py-0.5 rounded-lg bg-[var(--card)] border border-[var(--line)] hover:bg-[var(--y)] text-[10px] font-bold text-[var(--ink)] cursor-pointer transition-colors"
                      >
                        {copiedBankId === acc.id ? "✓ Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bank Deposit Slip Upload */}
            <div className="flex flex-col gap-2 p-4 rounded-2xl border border-[var(--line)] bg-[var(--bg)]">
              <label className="text-xs font-bold text-[var(--ink)] flex items-center justify-between">
                <span>
                  {locale === "en"
                    ? "Upload Rs. 5,000 Bank Deposit Slip (Optional right now, required before dispatch)"
                    : "රු. 5,000 බැංකු තැන්පතු රිසිට්පත (Bank Slip) Upload කරන්න"}
                </span>
                <span className="text-[10px] text-amber-700 font-bold">Admin Verified</span>
              </label>

              {depositSlip ? (
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-emerald-400">
                  <div className="flex items-center gap-2.5">
                    <img
                      src={depositSlip}
                      alt="Deposit Slip"
                      className="w-12 h-12 object-cover rounded-lg border border-[var(--line)]"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-emerald-800">
                        ✓ Slip Attached (රු. 5,000 Deposit)
                      </span>
                      <span className="text-[10px] text-[var(--mut)]">Ready for Admin review</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDepositSlip("")}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                  >
                    ✕ Remove
                  </button>
                </div>
              ) : (
                <label className="p-4 rounded-xl border-2 border-dashed border-[var(--line)] hover:border-[#FFC20E] flex items-center justify-center gap-2 text-center cursor-pointer transition-colors bg-white/60">
                  <span className="text-xl">📄</span>
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-bold text-[var(--ink)]">
                      {locale === "en"
                        ? "Click to attach your Bank Slip / Online Transfer receipt"
                        : "බැංකු රිසිට්පත (Slip) හෝ Online Transfer screenshot එක අමුණන්න"}
                    </span>
                    <span className="text-[10px] text-[var(--mut)]">
                      JPG, PNG or PDF screenshot
                    </span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageUpload(e, setDepositSlip)}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="py-4 px-6 rounded-2xl bg-[var(--y)] hover:bg-[#e6ad00] text-[#26231B] font-black text-sm cursor-pointer transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2 text-base"
          >
            {submitting ? (
              <>
                <div className="w-5 h-5 border-2 border-[#26231B] border-t-transparent rounded-full animate-spin" />
                <span>
                  {locale === "en"
                    ? "Submitting Vehicle Registration..."
                    : "ලියාපදිංචි කිරීම යොමු වෙමින් පවතී..."}
                </span>
              </>
            ) : (
              <span>
                {locale === "en"
                  ? "Submit Lorry Registration (රු. 5,000 Deposit Account)"
                  : "ලොරිය ලියාපදිංචි කරන්න (රු. 5,000 තැන්පතුව සමඟ)"}
              </span>
            )}
          </button>
        </form>
      )}
    </main>
  );
}
