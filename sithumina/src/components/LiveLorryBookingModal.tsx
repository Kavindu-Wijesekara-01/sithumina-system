"use client";

import { todayYmd } from "@/lib/ledger";
import React, { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { Lorry } from "@/lib/mock-lorries";
import { createBookingAction } from "@/actions";
import LocationPicker, { type Pin } from "@/components/LocationPicker";
import { resolveLocationCoordinates } from "@/lib/sri-lanka-routes";

interface LiveLorryBookingModalProps {
  lorry: Lorry | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (bookingId: string) => void;
}

const CARGO_NATURE_OPTIONS = [
  { en: "Commercial Cargo / Produce / Agriculture", si: "වෙළඳ / කෘෂිකාර්මික / අස්වනු" },
  { en: "Household Goods & Furniture", si: "ගෘහ භාණ්ඩ / ලී බඩු" },
  { en: "Hardware, Timber & Construction", si: "ඉදිකිරීම් ද්‍රව්‍ය / ලී / යකඩ" },
  { en: "Machinery, Tools & Industrial Equipment", si: "කාර්මික යන්ත්‍ර / මෙවලම්" },
  { en: "Cartons, Parcels & Packaged Goods", si: "පෙට්ටි / පාර්සල් / ඇසුරුම් කළ භාණ්ඩ" },
  { en: "Fragile / Glassware Items", si: "බිඳෙනසුලු භාණ්ඩ" },
  { en: "Other / General Goods", si: "වෙනත් සාමාන්‍ය භාණ්ඩ" },
];

export const LiveLorryBookingModal: React.FC<LiveLorryBookingModalProps> = ({
  lorry,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { locale } = useLanguage();

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [pickupCity, setPickupCity] = useState(lorry?.startLocation || "");
  const [pickupPin, setPickupPin] = useState<Pin | null>(null);
  const [dropPin, setDropPin] = useState<Pin | null>(null);
  const [deliveryCity, setDeliveryCity] = useState(lorry?.endLocation || "");
  const [cargoNature, setCargoNature] = useState(CARGO_NATURE_OPTIONS[0].en);
  const [cargoDetails, setCargoDetails] = useState("");
  const [weightKg, setWeightKg] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);

  if (!isOpen || !lorry) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cName = customerName.trim();
    const cPhone = phone.trim();
    const cIdNumber = idNumber.trim();
    const cWhatsapp = whatsapp.trim();
    const pCity = pickupCity.trim();
    const dCity = deliveryCity.trim();
    const cDetails = cargoDetails.trim();

    if (!cName) {
      setErrorMessage(locale === "en" ? "Please enter your Name" : "කරුණාකර ඔබගේ නම ඇතුළත් කරන්න");
      return;
    }
    if (!cPhone || cPhone.length < 9) {
      setErrorMessage(locale === "en" ? "Please enter a valid Mobile Number" : "වලංගු ජංගම දුරකථන අංකයක් ඇතුළත් කරන්න");
      return;
    }
    if (!cIdNumber) {
      setErrorMessage(locale === "en" ? "Please enter your National ID Number (NIC)" : "කරුණාකර ඔබගේ ජාතික හැඳුනුම්පත් අංකය (NIC) ඇතුළත් කරන්න");
      return;
    }
    if (!cWhatsapp || cWhatsapp.length < 9) {
      setErrorMessage(locale === "en" ? "Please enter a valid WhatsApp Number" : "වලංගු WhatsApp අංකයක් ඇතුළත් කරන්න");
      return;
    }
    if (!pCity) {
      setErrorMessage(locale === "en" ? "Please enter Pickup Location (බඩු ගන්නා තැන)" : "බඩු පටවන / ගන්නා ස්ථානය ඇතුළත් කරන්න");
      return;
    }
    if (!dCity) {
      setErrorMessage(locale === "en" ? "Please enter Delivery Location (බඩු බාන තැන)" : "බඩු බාන ස්ථානය ඇතුළත් කරන්න");
      return;
    }
    if (!cDetails) {
      setErrorMessage(locale === "en" ? "Please describe the nature of your cargo/goods" : "කරුණාකර භාණ්ඩයේ ස්වභාවය විස්තර කරන්න");
      return;
    }

    setIsSubmitting(true);

    try {
      // Resolve coordinates for pickup and delivery
      const pCoords = resolveLocationCoordinates(pCity);
      const dCoords = resolveLocationCoordinates(dCity);

      const fullCargoDescription = `${cargoNature} | ${cDetails}${weightKg ? ` | Weight approx: ${weightKg}` : ""}${cWhatsapp ? ` | WhatsApp: ${cWhatsapp}` : ""}`;

      const res = await createBookingAction({
        customerName: cName,
        phone: cPhone,
        customerIdNumber: cIdNumber,
        pickup: pCity,
        destination: dCity,
        pickupLat: pickupPin?.lat ?? pCoords?.[0],
        pickupLng: pickupPin?.lng ?? pCoords?.[1],
        deliveryLat: dropPin?.lat ?? dCoords?.[0],
        deliveryLng: dropPin?.lng ?? dCoords?.[1],
        pickupPinned: Boolean(pickupPin),
        dropoffPinned: Boolean(dropPin),
        date: todayYmd(),
        vehicleType: lorry.vehicleType || "Live Empty Lorry",
        notes: fullCargoDescription,
        cargoNature,
        cargoWeight: weightKg || undefined,
        assignedPlate: lorry.plate,
        assignedLorryId: lorry.id,
        bookingType: "live_lorry",
        status: "pending",
      });

      if (res.success && res.data?.id) {
        setCreatedBookingId(res.data.id);
        if (onSuccess) onSuccess(res.data.id);
      } else {
        const errText = !res.success ? res.error : undefined;
        setErrorMessage(errText || (locale === "en" ? "Failed to submit booking. Please retry." : "වෙන්කිරීම සිදුකිරීම අසාර්ථක විය. නැවත උත්සාහ කරන්න."));
      }
    } catch (err: any) {
      setErrorMessage(err?.message || (locale === "en" ? "An unexpected error occurred." : "දෝෂයක් සිදුවිය. කරුණාකර නැවත උත්සාහ කරන්න."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200 select-none overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg my-auto bg-white rounded-3xl border border-[#E7E2D0] shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="bg-[#26231B] text-white p-4 sm:p-5 flex items-center justify-between border-b border-[#3B3727]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-3 h-3 rounded-full bg-[#1E9E5A] animate-pulse flex-none" />
            <div>
              <h2 className="text-base sm:text-lg font-black text-[#FFC20E] truncate">
                {locale === "en" ? "Book Online Live Lorry" : "සජීවී හිස් ලොරිය වෙන්කරන්න"}
              </h2>
              <p className="text-[11px] text-[#A8A28E] truncate">
                {lorry.plate} • {lorry.route || "Live Corridor"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-sm cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Lorry Quick Info Strip */}
        <div className="bg-[#FFF9E6] px-4 py-2.5 border-b border-[#FFEBAC] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 min-w-0 text-[#5B4300] font-bold">
            <span className="px-2 py-0.5 rounded-md bg-[#FFC20E] text-[#26231B] font-black text-[11px]">
              {lorry.plate}
            </span>
            <span className="truncate">{lorry.vehicleType || "Standard Freight Lorry"}</span>
          </div>
          <span className="text-[11px] font-bold text-[#8A6700] flex-none">
            {lorry.availableSpace || "Full (100%) Available"}
          </span>
        </div>

        {/* Privacy Notice Banner */}
        <div className="bg-[#F4F8FA] px-4 py-2 border-b border-[#E1ECF0] flex items-center gap-2 text-[11px] text-[#2C5263]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-[#1A73E8] flex-none">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="leading-tight">
            {locale === "en"
              ? "Driver phone number unlocks directly once Admin quotes the fee and payment receipt is uploaded."
              : "පරිපාලක විසින් ගාස්තුව නියම කර, ගෙවීම් රිසිට්පත යැවූ පසු රියදුරුගේ සෘජු දුරකථන අංකය පෙන්වනු ලැබේ."}
          </span>
        </div>

        {/* Body / Content */}
        {createdBookingId ? (
          <div className="p-6 text-center flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-[#E8F8F0] border border-[#1E9E5A]/30 flex items-center justify-center text-[#1E9E5A] mb-1">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <h3 className="text-lg font-black text-[#26231B]">
              {locale === "en" ? "Booking Request Submitted!" : "වෙන්කිරීම සාර්ථකව යොමු කරන ලදී!"}
            </h3>
            <div className="bg-[#F7F5EE] p-3 rounded-2xl border border-[#E7E2D0] w-full text-xs text-[#26231B] flex flex-col gap-1">
              <span className="text-[11px] text-[#6F6A5A] font-bold">Booking Reference ID:</span>
              <span className="text-base font-black font-mono text-[#1E9E5A]">{createdBookingId}</span>
            </div>
            <p className="text-xs text-[#6F6A5A] leading-relaxed max-w-sm">
              {locale === "en"
                ? "Your booking has been received by Sithumina Admin. Once our team sets the discounted live rate, you will be able to upload your bank slip and directly call the driver."
                : "ඔබගේ ඉල්ලීම Sithumina ප්‍රධාන කාර්යාලය වෙත ලැබී ඇත. මිල ගණන් නියම කළ පසු ඔබට බැංකු රිසිට්පත upload කර රියදුරු සමඟ සෘජුවම සම්බන්ධ විය හැක."}
            </p>
            <div className="pt-3 flex flex-col sm:flex-row gap-2.5 w-full">
              <a
                href={`/login?phone=${encodeURIComponent(phone.trim())}`}
                className="flex-1 py-3 px-4 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#26231B] font-black text-xs text-center no-underline shadow-md"
              >
                {locale === "en" ? "View in Customer Portal →" : "පාරිභෝගික ගිණුමෙන් බලන්න →"}
              </a>
              <button
                type="button"
                onClick={onClose}
                className="py-3 px-4 rounded-xl border border-[#E7E2D0] bg-white hover:bg-[#F7F5EE] text-[#26231B] font-bold text-xs cursor-pointer"
              >
                {locale === "en" ? "Done" : "අවසන් කරන්න"}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 sm:p-5 flex flex-col gap-3.5 max-h-[70vh] overflow-y-auto">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
                {errorMessage}
              </div>
            )}

            {/* Customer Name, Phone & National ID (NIC) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-black text-[#26231B] mb-1">
                  {locale === "en" ? "Customer Name *" : "පාරිභෝගිකයාගේ නම *"}
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B] font-bold focus:outline-none focus:border-[#FFC20E]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-[#26231B] mb-1">
                  {locale === "en" ? "Mobile Phone *" : "ජංගම දුරකථන අංකය *"}
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B] font-mono font-bold focus:outline-none focus:border-[#FFC20E]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-[#26231B] mb-1">
                  {locale === "en" ? "National ID (NIC) *" : "හැඳුනුම්පත් අංකය (NIC) *"}
                </label>
                <input
                  type="text"
                  required
                  placeholder={locale === "en" ? "e.g. 199012345678" : "උදා: 199012345678"}
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B] font-mono uppercase font-bold focus:outline-none focus:border-[#FFC20E]"
                />
              </div>
            </div>

            {/* WhatsApp Number */}
            <div>
              <label className="block text-[11px] font-black text-[#26231B] mb-1 flex items-center justify-between">
                <span>{locale === "en" ? "WhatsApp Number *" : "WhatsApp අංකය *"}</span>
                <span className="text-[10px] text-[#1E9E5A] font-bold">For Quote & Receipt verification</span>
              </label>
              <input
                type="tel"
                required
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B] font-mono font-bold focus:outline-none focus:border-[#FFC20E]"
              />
            </div>

            {/* Pickup & Delivery Cities */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-black text-[#26231B] mb-1">
                  {locale === "en" ? "Pickup Location (බඩු ගන්නා තැන) *" : "බඩු පටවන ස්ථානය / නගරය *"}
                </label>
                <input
                  type="text"
                  required
                  value={pickupCity}
                  onChange={(e) => setPickupCity(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B] font-bold focus:outline-none focus:border-[#FFC20E]"
                />
                <LocationPicker
                  label="Pickup location"
                  address={pickupCity}
                  pin={pickupPin}
                  onChange={setPickupPin}
                  locale={locale}
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-[#26231B] mb-1">
                  {locale === "en" ? "Delivery Location (බඩු බාන තැන) *" : "බඩු බාන ස්ථානය / නගරය *"}
                </label>
                <input
                  type="text"
                  required
                  value={deliveryCity}
                  onChange={(e) => setDeliveryCity(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B] font-bold focus:outline-none focus:border-[#FFC20E]"
                />
                <LocationPicker
                  label="Drop-off location"
                  address={deliveryCity}
                  pin={dropPin}
                  onChange={setDropPin}
                  locale={locale}
                />
              </div>
            </div>

            {/* Cargo Category */}
            <div>
              <label className="block text-[11px] font-black text-[#26231B] mb-1">
                {locale === "en" ? "Nature of Goods / Cargo *" : "භාණ්ඩ වර්ගය / ස්වභාවය *"}
              </label>
              <select
                value={cargoNature}
                onChange={(e) => setCargoNature(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B] font-bold focus:outline-none focus:border-[#FFC20E]"
              >
                {CARGO_NATURE_OPTIONS.map((opt) => (
                  <option key={opt.en} value={opt.en}>
                    {locale === "en" ? opt.en : opt.si}
                  </option>
                ))}
              </select>
            </div>

            {/* Details & Approximate Weight */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-black text-[#26231B] mb-1">
                  {locale === "en" ? "Cargo Details & Items List *" : "භාණ්ඩ විස්තරය (පෙට්ටි, මිටි ආදී) *"}
                </label>
                <input
                  type="text"
                  required
                  value={cargoDetails}
                  onChange={(e) => setCargoDetails(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B] focus:outline-none focus:border-[#FFC20E]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-[#26231B] mb-1">
                  {locale === "en" ? "Approx. Weight" : "දළ බර"}
                </label>
                <input
                  type="text"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B] font-mono focus:outline-none focus:border-[#FFC20E]"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 px-4 rounded-2xl bg-[#FFC20E] hover:bg-[#e6ad00] active:scale-[0.99] text-[#26231B] font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>{locale === "en" ? "Submitting Booking..." : "යොමු කරමින් පවතී..."}</span>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                    <span>{locale === "en" ? "Submit Booking to Admin" : "වෙන්කිරීම Admin වෙත යොමු කරන්න"}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
