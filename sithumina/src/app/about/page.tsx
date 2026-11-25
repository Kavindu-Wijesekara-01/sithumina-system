"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/context/LanguageContext";

// Animated Counter component that starts counting when scrolled into viewport
function AnimatedCounter({
  target,
  duration = 1600,
  suffix = "",
  prefix = "",
}: {
  target: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
}) {
  const [count, setCount] = useState(0);
  const containerRef = useRef<HTMLSpanElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          let startTimestamp: number | null = null;
          const step = (timestamp: number) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(easeProgress * target));
            if (progress < 1) {
              window.requestAnimationFrame(step);
            } else {
              setCount(target);
            }
          };
          window.requestAnimationFrame(step);
        }
      },
      { threshold: 0.25 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [target, duration, hasAnimated]);

  return (
    <span ref={containerRef} className="tabular-nums">
      {prefix}
      {count}
      {suffix}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SEO: structured data (JSON-LD) – tells Google which cities we serve
// TODO: replace SITE_URL (and add streetAddress / geo if you have them)
// ---------------------------------------------------------------------------
const SITE_URL = "https://www.yourdomain.lk";

const SERVICE_AREAS = [
  "Kiribathgoda",
  "Kadawatha",
  "Colombo",
  "Kelaniya",
  "Wattala",
  "Ragama",
  "Ja-Ela",
  "Peliyagoda",
  "Mabola",
  "Hendala",
  "Gampaha",
  "Maharagama",
  "Nugegoda",
  "Dehiwala",
  "Mount Lavinia",
  "Moratuwa",
  "Kottawa",
  "Malabe",
  "Battaramulla",
  "Negombo",
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": ["LocalBusiness", "MovingCompany"],
  "@id": `${SITE_URL}/#business`,
  name: "Sithumina Transport",
  alternateName: [
    "Sithumina Transports",
    "Kiribathgoda Transport",
    "Kadawatha Transport",
    "Colombo Lorry",
  ],
  url: `${SITE_URL}/about`,
  image: `${SITE_URL}/img2.jpeg`,
  description:
    "Kiribathgoda transport, Kadawatha transport and Colombo cargo transport service. Lorry hire, house and office moving, refrigerated trucks and A/C passenger buses available 24 hours a day across Sri Lanka.",
  telephone: ["+94112984984", "+94755984984"],
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ],
    opens: "00:00",
    closes: "23:59",
  },
  address: {
    "@type": "PostalAddress",
    addressLocality: "Kiribathgoda",
    addressRegion: "Western Province",
    addressCountry: "LK",
  },
  areaServed: SERVICE_AREAS.map((name) => ({
    "@type": "City",
    name,
  })),
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Transport Services",
    itemListElement: [
      "House and office moving",
      "Cargo and parcel transport",
      "Lorry hire (Buddy, Dimo Batta, Maximo)",
      "Freezer / refrigerated transport",
      "Passenger bus and tour transport",
    ].map((n) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: n },
    })),
  },
};

// ---------------------------------------------------------------------------
// Service icons (stroke icons) used by the stylish service cards
// ---------------------------------------------------------------------------
const SERVICE_ICONS: Record<string, React.ReactNode> = {
  home: (
    <>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </>
  ),
  cargo: (
    <>
      <path d="M21 8l-9-5-9 5v8l9 5 9-5z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </>
  ),
  upkeep: (
    <>
      <path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </>
  ),
  bus: (
    <>
      <rect x="4" y="3" width="16" height="14" rx="3" />
      <path d="M4 11h16M8 21v-4M16 21v-4" />
      <circle cx="8" cy="14" r=".6" />
      <circle cx="16" cy="14" r=".6" />
    </>
  ),
};

const SERVICES = [
  {
    icon: "home",
    en: {
      title: "Moving Houses & Offices",
      desc: "Complete house, office and business moving in Colombo, Kiribathgoda, Kadawatha and Kelaniya with trained packing helpers.",
      pill: "Packing included",
    },
    si: {
      title: "නිවාස හා කාර්යාල මාරු කිරීම්",
      desc: "කොළඹ, කිරිබත්ගොඩ, කඩවත ඇතුළු නිවාස, කාර්යාල හා ව්‍යාපාරික ස්ථාන ආරක්ෂිතව සහ ඉක්මනින් වෙනත් ස්ථානයකට ගෙනයාම.",
      pill: "ඇසුරුම් ඇතුළත්",
    },
  },
  {
    icon: "cargo",
    en: {
      title: "Packages & Cargo Transit",
      desc: "Kiribathgoda cargo transport and Colombo cargo transport for bundles, packages and commercial products across all 9 provinces.",
      pill: "All 9 provinces",
    },
    si: {
      title: "භාණ්ඩ හා පාර්සල් ප්‍රවාහනය",
      desc: "කිරිබත්ගොඩ සහ කොළඹ සිට දිවයිනේ ඕනෑම තැනකට තොග හා සිල්ලර නිෂ්පාදන සහ පාර්සල් විශ්වාසවන්තව බෙදාහැරීම.",
      pill: "පළාත් 9ම",
    },
  },
  {
    icon: "upkeep",
    en: {
      title: "Stacking & Cleaning Upkeep",
      desc: "Stacking, emptying, cleaning, and upkeep administrations with courteous drivers and aides.",
      pill: "Drivers & aides",
    },
    si: {
      title: "පැටවීම, බෑම හා නඩත්තුව",
      desc: "භාණ්ඩ පැටවීම, බෑම, පිරිසිදු කිරීම සහ ආරක්ෂිතව ඇසිරීම සඳහා පළපුරුදු සහායක මඩුල්ල.",
      pill: "රියදුරන් සහ සහායකයින්",
    },
  },
  {
    icon: "bus",
    en: {
      title: "Traveler Transportation",
      desc: "Comfortable traveler transportation for corporate staff, tours, pilgrimages, and family events.",
      pill: "Tours & events",
    },
    si: {
      title: "මගී හා සංචාරක සේවා",
      desc: "සුඛෝපභෝගී වායුසමනය කළ (A/C) බස් රථ මගින් මගී, කාර්යාල හා විනෝද චාරිකා ප්‍රවාහනය.",
      pill: "චාරිකා හා උත්සව",
    },
  },
];

// ---------------------------------------------------------------------------
// Vehicle illustration + data used by the stylish vehicle cards
// ---------------------------------------------------------------------------
function TruckArt({ w, cold }: { w: number; cold?: boolean }) {
  const cab = 10 + w + 4;
  const width = cab + 59;
  const mid = 10 + w / 2;
  return (
    <svg viewBox={`0 0 ${width} 92`} className="block w-full h-auto" aria-hidden="true">
      <rect
        x="10"
        y="12"
        width={w}
        height="52"
        rx="8"
        fill={cold ? "#DCE8FF" : "#FFFFFF"}
        stroke="#1C1A14"
        strokeWidth="2.5"
      />
      <rect x="10" y="48" width={w} height="8" fill={cold ? "#2F5BEA" : "#FFC20E"} />
      {cold ? (
        <g stroke="#2F5BEA" strokeWidth="2.5" strokeLinecap="round">
          <path d={`M${mid} 22v18M${mid - 8} 27l16 8M${mid + 8} 27l-16 8`} />
        </g>
      ) : (
        <path d={`M24 24h${Math.min(w - 28, 40)}`} stroke="#C9D6EE" strokeWidth="3" strokeLinecap="round" />
      )}
      <path
        d={`M${cab} 26h26q8 0 13 8l8 12q2 4 2 8v10h-49z`}
        fill="#FFC20E"
        stroke="#1C1A14"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d={`M${cab + 8} 32h16q4 0 7 4l5 8h-28z`}
        fill="#EAF1FD"
        stroke="#1C1A14"
        strokeWidth="2"
      />
      {[24, cab + 14, cab + 40].map((x) => (
        <g key={x}>
          <circle cx={x} cy="68" r="11" fill="#1C1A14" />
          <circle cx={x} cy="68" r="4.5" fill="#E2E8F1" />
        </g>
      ))}
    </svg>
  );
}

const VEHICLES = [
  {
    w: 90,
    level: 1,
    cold: false,
    en: {
      title: "Buddy Truck Transport",
      desc: "Ideal for small and medium-sized deliveries and moving requirements. A popular Colombo lorry for city deliveries.",
      badge: "Small loads",
    },
    si: {
      title: "බඩී ට්‍රක් ප්‍රවාහනය",
      desc: "සුළු හා මධ්‍යම පරිමාණයේ භාණ්ඩ බෙදාහැරීම් සහ ප්‍රවාහන අවශ්‍යතා සඳහා වඩාත් සුදුසුයි.",
      badge: "කුඩා බර",
    },
  },
  {
    w: 110,
    level: 2,
    cold: false,
    en: {
      title: "Dimo Batta Transport",
      desc: "Suitable for household goods, business deliveries, furniture, and general cargo from Kiribathgoda, Kadawatha and Colombo.",
      badge: "Medium loads",
    },
    si: {
      title: "ඩිමෝ බට්ටා ප්‍රවාහනය",
      desc: "ගෘහ භාණ්ඩ, ව්‍යාපාරික තොග බෙදාහැරීම් සහ සාමාන්‍ය ප්‍රවාහන සඳහා.",
      badge: "මධ්‍යම බර",
    },
  },
  {
    w: 140,
    level: 3,
    cold: false,
    en: {
      title: "Maximo Truck Transport",
      desc: "A practical option for commercial and larger-volume transportation needs.",
      badge: "Large loads",
    },
    si: {
      title: "මැක්සිමෝ ට්‍රක් ප්‍රවාහනය",
      desc: "වාණිජමය හා විශාල ධාරිතාවකින් යුතු භාණ්ඩ ප්‍රවාහන අවශ්‍යතා සඳහා ප්‍රායෝගික තේරීමක්.",
      badge: "විශාල බර",
    },
  },
  {
    w: 115,
    level: 3,
    cold: true,
    en: {
      title: "Freezer / Refrigerated Transport",
      desc: "Suitable for transporting temperature-sensitive products and goods requiring controlled conditions.",
      badge: "Cold chain",
    },
    si: {
      title: "ශීතකරණ / සිසිලන ප්‍රවාහනය",
      desc: "උෂ්ණත්වය පාලනය කළ යුතු සහ සිසිලනය අවශ්‍ය විශේෂිත භාණ්ඩ ප්‍රවාහනය සඳහා.",
      badge: "සිසිලන",
    },
  },
];

// All 12 authentic fleet images from the public directory (img1 to img11 .jpeg, img12 .png)
const FLEET_GALLERY = [
  { id: 1, src: "/img1.jpeg", alt: "Sithumina Transport JAC box lorry - Kiribathgoda lorry and Colombo lorry hire" },
  { id: 2, src: "/img2.jpeg", alt: "Sithumina Transport fleet lineup - Kadawatha transport and Kiribathgoda transport" },
  { id: 3, src: "/img3.jpeg", alt: "Sithumina Transport highway freight convoy - Colombo cargo transport" },
  { id: 4, src: "/img4.jpeg", alt: "Sithumina Transport Maxximo city truck - Kadawatha lorry service" },
  { id: 5, src: "/img5.jpeg", alt: "Sithumina Transport covered delivery carriers - Kiribathgoda cargo transport" },
  { id: 6, src: "/img6.jpeg", alt: "Sithumina Transport express cargo units - Colombo transport service" },
  { id: 7, src: "/img7.jpeg", alt: "Sithumina Transport inter-provincial freight - Colombo, Kelaniya and Wattala" },
  { id: 8, src: "/img8.jpeg", alt: "Sithumina Transport luxury passenger coach - Kiribathgoda and Colombo bus hire" },
  { id: 9, src: "/img9.jpeg", alt: "Sithumina Transport Toyota Coaster A/C bus - Kadawatha tours and events" },
  { id: 10, src: "/img10.jpeg", alt: "Sithumina Transport heavy Eicher container lorry - Colombo cargo transport" },
  { id: 11, src: "/img11.jpeg", alt: "Sithumina Transport heavy cargo truck - Kiribathgoda lorry hire" },
  { id: 12, src: "/img12.png", alt: "Sithumina Transport executive bus interior - Colombo passenger transport" },
];

export default function AboutPage() {
  const { locale } = useLanguage();
  const lang = locale === "en" ? "en" : "si";
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [activeService, setActiveService] = useState<number>(3);

  const openLightbox = (index: number) => setSelectedImageIndex(index);
  const closeLightbox = () => setSelectedImageIndex(null);

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedImageIndex === null) return;
    setSelectedImageIndex((prev) =>
      prev === null ? 0 : (prev - 1 + FLEET_GALLERY.length) % FLEET_GALLERY.length
    );
  };

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedImageIndex === null) return;
    setSelectedImageIndex((prev) =>
      prev === null ? 0 : (prev + 1) % FLEET_GALLERY.length
    );
  };

  return (
    <main
      className="p-3.5 sm:p-6 lg:p-10 flex flex-col gap-10 lg:gap-14 max-w-7xl mx-auto w-full select-none"
      id="about-content"
    >
      {/* SEO: JSON-LD structured data (invisible, no UI impact) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      {/* 1. HERO & COMPANY OVERVIEW */}
      <section
        className="flex flex-col gap-6"
        aria-label={
          locale === "en"
            ? "About Sithumina Transport - Kiribathgoda, Kadawatha and Colombo transport"
            : "සිතුමිණ ට්‍රාන්ස්පෝර්ට් - කිරිබත්ගොඩ, කඩවත සහ කොළඹ ප්‍රවාහන සේවාව"
        }
      >
        <div className="flex flex-col gap-3 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--y3)] text-[#5B4300] text-xs font-bold w-fit border border-[var(--y2)] shadow-xs">
            {/* Standard Shield Badge Icon */}
            <svg
              className="w-3.5 h-3.5 text-[#5B4300] flex-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span>
              {locale === "en"
                ? "Official Sri Lanka Freight & Transportation Organization"
                : "ශ්‍රී ලංකාවේ ප්‍රමුඛතම භාණ්ඩ හා මගී ප්‍රවාහන ආයතනය"}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-black tracking-tight text-[var(--ink)] leading-tight m-0">
            {locale === "en" ? (
              <>
                About <span className="text-[#C51616]">Sithumina Transport</span>
              </>
            ) : (
              <>
                <span className="text-[#C51616]">SITHUMINA TRANSPORTS</span> සේවාව පිළිබඳව
              </>
            )}
          </h1>
        </div>

        {/* Primary Story / About Text Box */}
        <div className="rounded-2xl sm:rounded-3xl bg-[var(--card)] border border-[var(--line)] p-6 sm:p-8 lg:p-10 shadow-xs flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
            {/* Paragraph 1 */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[var(--y3)] border border-[var(--y2)] flex items-center justify-center text-[#5B4300] flex-none">
                  {/* Standard Truck Icon */}
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="1" y="3" width="15" height="13" rx="2" />
                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-[#C51616]">
                  {locale === "en" ? "24/7 Islandwide Service" : "පැය 24 පුරා දිවයින පුරා සේවය"}
                </span>
              </div>
              <p className="text-[var(--ink)] text-sm sm:text-base lg:text-lg leading-relaxed font-medium m-0">
                {locale === "en" ? (
                  "We are a trusted Kiribathgoda transport and Kadawatha transport provider with a responsible, courteous staff. We provide Colombo transport services 24 hours a day, with a wide range of lorries and vehicles to serve Colombo, Kelaniya, Wattala and every major city quickly and efficiently."
                ) : (
                  "අප කිරිබත්ගොඩ, කඩවත සහ කොළඹ ප්‍රවාහන සැපයුම් ආයතනයක් වන අතර වගකීමෙන්, ආචාරශීලී, සේවක මඩුල්ලක් අප සතුය, පැය 24 පුරා අප සේවා සපයන අතර, කොළඹ, කැලණිය, වත්තල ඇතුළු සෑම නගරයකටම එම සේවා ඉක්මනින් හා කාර්යක්ෂම ලෙස සැපයීම සඳහා ලොරි සහ වාහන රාශියක් අප සතුව ඇත."
                )}
              </p>
            </div>

            {/* Paragraph 2 */}
            <div className="flex flex-col gap-4 border-t lg:border-t-0 lg:border-l border-[var(--line)] pt-5 lg:pt-0 lg:pl-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[var(--y3)] border border-[var(--y2)] flex items-center justify-center text-[#5B4300] flex-none">
                  {/* Standard Cargo Package Icon */}
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-[#C51616]">
                  {locale === "en" ? "Comprehensive Solutions" : "විශ්වාසනීය ප්‍රවාහන සේවා"}
                </span>
              </div>
              <p className="text-[var(--ink)] text-sm sm:text-base lg:text-lg leading-relaxed font-medium m-0">
                {locale === "en" ? (
                  "Sithumina Transport is a private transportation organization offering Kiribathgoda cargo transport, Colombo cargo transport and lorry hire in Kiribathgoda, Kadawatha and Colombo. We handle a wide range of bundles, packages and products transportation, stacking, emptying, cleaning and upkeep administrations, with drivers and aides, traveler transportation, moving of houses, workplaces and business premises."
                ) : (
                  "සිතුමිණ ට්‍රාන්ස්පෝර්ට් යනු කිරිබත්ගොඩ, කඩවත සහ කොළඹ ප්‍රදේශවල ලොරි සේවා සහ කාගෝ ප්‍රවාහනය සපයන පෞද්ගලික ප්‍රවාහන ආයතනයක් වන අතර භාණ්ඩ, පාර්සල් හා නිෂ්පාදන ප්‍රවාහනය, පැටවීම, බෑම, පිරිසිදු කිරීම සහ නඩත්තු සේවා, රියදුරන් සහ සහායකයින් සමඟ මගී ප්‍රවාහනය, නිවාස, කාර්යාල හා ව්‍යාපාරික ස්ථාන මාරු කිරීම් ඇතුළු පුළුල් පරාසයක සේවාවන් සපයයි."
                )}
              </p>
            </div>
          </div>

          {/* Stat Highlights Counter Grid with Scroll Count-Up Animation */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-4 border-t border-[var(--line)]">
            <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex flex-col gap-1 transition-transform hover:-translate-y-0.5 duration-200">
              <span className="text-2xl sm:text-3xl font-black text-[#C51616] leading-none">
                <AnimatedCounter target={200} suffix="+" />
              </span>
              <span className="text-xs font-bold text-[var(--ink)]">
                {locale === "en" ? "Active Vehicles" : "සක්‍රීය රථ වාහන"}
              </span>
              <span className="text-[11px] text-[var(--mut)]">
                {locale === "en" ? "Lorries, Trucks & Buses" : "ලොරි, ට්‍රක් හා බස් රථ"}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex flex-col gap-1 transition-transform hover:-translate-y-0.5 duration-200">
              <span className="text-2xl sm:text-3xl font-black text-[#5B4300] leading-none">
                <AnimatedCounter target={30} suffix="+" />
              </span>
              <span className="text-xs font-bold text-[var(--ink)]">
                {locale === "en" ? "Years Experience" : "වසරක විශිෂ්ට පළපුරුද්ද"}
              </span>
              <span className="text-[11px] text-[var(--mut)]">
                {locale === "en" ? "Trusted operations" : "විශ්වාසනීය මෙහෙයුම්"}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex flex-col gap-1 transition-transform hover:-translate-y-0.5 duration-200">
              <span className="text-2xl sm:text-3xl font-black text-[#1E9E5A] leading-none">
                <AnimatedCounter target={9} suffix="/9" />
              </span>
              <span className="text-xs font-bold text-[var(--ink)]">
                {locale === "en" ? "Provinces Covered" : "පළාත් 9ම ආවරණය"}
              </span>
              <span className="text-[11px] text-[var(--mut)]">
                {locale === "en" ? "Islandwide network" : "දිවයින පුරා සේවය"}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex flex-col gap-1 transition-transform hover:-translate-y-0.5 duration-200">
              <span className="text-2xl sm:text-3xl font-black text-[var(--ink)] leading-none">
                <AnimatedCounter target={24} suffix="/365" />
              </span>
              <span className="text-xs font-bold text-[var(--ink)]">
                {locale === "en" ? "Hours Full Service" : "පැය 24ම සේවාව"}
              </span>
              <span className="text-[11px] text-[var(--mut)]">
                {locale === "en" ? "Responsible staff" : "ආචාරශීලී සේවක මඩුල්ල"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. OUR VISION AND MISSION SECTION */}
      <section className="flex flex-col items-center gap-6 pt-2" id="vision-mission">
        <div className="flex flex-col items-center text-center gap-2">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[var(--ink)] tracking-tight m-0">
            {locale === "en" ? "Our Vision And Mission" : "අපගේ දැක්ම සහ මෙහෙවර"}
          </h2>
          {/* Distinctive Orange/Yellow Underline Accent Bar */}
          <div className="w-16 h-1 bg-[#FF7A00] rounded-full mt-1" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl">
          {/* Card 1: Our Vision */}
          <div className="rounded-2xl bg-white border border-[var(--line)] p-6 sm:p-8 lg:p-9 shadow-md flex flex-col gap-3 transition-transform hover:-translate-y-1 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 text-[#FF7A00] flex items-center justify-center flex-none">
                {/* Standard Eye / Vision SVG Icon */}
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-[#1C1A14] m-0">
                {locale === "en" ? "Our Vision" : "අපගේ දැක්ම"}
              </h3>
            </div>
            <p className="text-[#4A453A] text-sm sm:text-base leading-relaxed m-0 font-normal">
              {locale === "en"
                ? "Our Vision is to increase the expectations of the transportation business in Sri Lanka as far as wellbeing, productivity and nature of administration."
                : "ශ්‍රී ලංකාවේ ප්‍රවාහන ක්ෂේත්‍රයේ ආරක්ෂාව, ඵලදායිතාව සහ සේවා ප්‍රමිතීන් ඉහළ නැංවීම අපගේ දැක්මයි."}
            </p>
          </div>

          {/* Card 2: Our Mission */}
          <div className="rounded-2xl bg-white border border-[var(--line)] p-6 sm:p-8 lg:p-9 shadow-md flex flex-col gap-3 transition-transform hover:-translate-y-1 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 text-[#FF7A00] flex items-center justify-center flex-none">
                {/* Standard Mission Target SVG Icon */}
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-[#1C1A14] m-0">
                {locale === "en" ? "Our Mission" : "අපගේ මෙහෙවර"}
              </h3>
            </div>
            <p className="text-[#4A453A] text-sm sm:text-base leading-relaxed m-0 font-normal">
              {locale === "en"
                ? "Our Mission is to give a total, customized and proficient vehicle answer for our clients, utilizing new innovation accessible in the business and our extraordinary ability accumulated more than thirty years - all to the whole fulfillment of our esteemed customers."
                : "වසර තිහකට අධික අත්දැකීම් සහ නවීන තාක්ෂණය උපයෝගී කරගනිමින්, අපගේ ගනුදෙනුකරුවන්ගේ පූර්ණ තෘප්තිය උදෙසා සම්පූර්ණ, කාර්යක්ෂම හා ගැලපෙන ප්‍රවාහන විසඳුම් ලබාදීම අපගේ මෙහෙවරයි."}
            </p>
          </div>
        </div>
      </section>

      {/* 3. KEY SERVICES (NEW STYLISH LIGHT-THEME CARDS) */}
      <section className="flex flex-col gap-6 pt-2" id="services">
        <div className="flex flex-col gap-2">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#2F5BEA]">
            <span className="w-2 h-2 rounded-full bg-[var(--y)] ring-4 ring-[var(--y3)]" />
            {locale === "en" ? "What We Do" : "අප සපයන ප්‍රධාන සේවාවන්"}
          </span>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-[var(--ink)] m-0">
            {locale === "en"
              ? "Comprehensive Fleet & Moving Capabilities"
              : "භාණ්ඩ, නිවාස මාරු කිරීම් හා මගී ප්‍රවාහනය"}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {SERVICES.map((s, i) => {
            const active = activeService === i;
            const t = s[lang];
            return (
              <button
                key={s.icon}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveService(i)}
                className={`text-left cursor-pointer flex flex-col gap-3.5 rounded-[22px] bg-white p-5 sm:p-6 border-[1.5px] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_36px_-18px_rgba(30,60,120,0.3)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2F5BEA] ${active
                  ? "border-[var(--y)] shadow-[0_0_0_4px_var(--y3),0_18px_36px_-20px_rgba(255,194,14,0.6)]"
                  : "border-[var(--line)]"
                  }`}
              >
                <span
                  className={`w-[52px] h-[52px] rounded-2xl flex items-center justify-center flex-none transition-colors duration-300 ${active ? "bg-[var(--y)] text-[#1C1A14]" : "bg-[#EAF1FB] text-[#2F5BEA]"
                    }`}
                >
                  <svg
                    className="w-6 h-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {SERVICE_ICONS[s.icon]}
                  </svg>
                </span>
                <h3 className="text-base sm:text-lg font-black text-[var(--ink)] leading-snug m-0">{t.title}</h3>
                <p className="text-sm text-[var(--mut)] leading-relaxed m-0">{t.desc}</p>
                <span
                  className={`mt-auto w-fit text-xs font-semibold text-[var(--ink)] rounded-full px-3 py-1 border transition-colors duration-300 ${active ? "bg-[var(--y3)] border-[var(--y2)]" : "bg-[var(--bg)] border-[var(--line)]"
                    }`}
                >
                  {t.pill}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. OUR VEHICLE OPTIONS (NEW STYLISH LIGHT-THEME CARDS) */}
      <section className="flex flex-col gap-6 pt-2" id="vehicles">
        <div className="flex flex-col gap-2">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#2F5BEA]">
            <span className="w-2 h-2 rounded-full bg-[var(--y)] ring-4 ring-[var(--y3)]" />
            {locale === "en" ? "Fleet Categories" : "අප සතු වාහන වර්ග"}
          </span>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-[var(--ink)] m-0">
            {locale === "en" ? "Our Vehicle Options" : "අපගේ වාහන තේරීම්"}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {VEHICLES.map((v) => {
            const t = v[lang];
            return (
              <article
                key={v.en.title}
                className="flex flex-col gap-2.5 rounded-3xl bg-white border-[1.5px] border-[var(--line)] p-3 pb-5 transition-all duration-300 hover:-translate-y-1 hover:border-[#C9D6EE] hover:shadow-[0_22px_40px_-22px_rgba(30,60,120,0.35)]"
              >
                {/* Illustration stage */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#EAF1FD] to-[#F6F9FE] px-3 pt-9">
                  <span
                    className={`absolute top-3 left-3 text-xs font-semibold rounded-full px-2.5 py-0.5 border ${v.cold
                      ? "bg-[#E7EDFF] text-[#2F5BEA] border-[#CBD8FF]"
                      : "bg-white text-[var(--mut)] border-[var(--line)]"
                      }`}
                  >
                    {t.badge}
                  </span>
                  <TruckArt w={v.w} cold={v.cold} />
                  <div className="relative h-2.5 -mx-3 bg-[#DCE5F3]">
                    <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-[#B9C8E2]" />
                  </div>
                </div>

                {/* Text */}
                <div className="flex flex-col gap-2 px-2.5 pt-1.5">
                  <h3 className="text-base sm:text-lg font-black text-[var(--ink)] leading-snug m-0">{t.title}</h3>
                  <p className="text-sm text-[var(--mut)] leading-relaxed m-0">{t.desc}</p>
                  <div
                    className="flex items-center gap-1.5 pt-1 text-xs font-medium text-[var(--mut)]"
                    aria-label={`${locale === "en" ? "Capacity" : "ධාරිතාව"} ${v.level}/3`}
                  >
                    {[1, 2, 3].map((n) => (
                      <i
                        key={n}
                        className={`block w-6 h-1.5 rounded ${n <= v.level ? "bg-[var(--y)]" : "bg-[var(--line)]"}`}
                      />
                    ))}
                    <span className="ml-1">{locale === "en" ? "Capacity" : "ධාරිතාව"}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* 5. FLEET PHOTO GALLERY (All 12 Images in public folder: img1 to img12) */}
      <section className="flex flex-col gap-5 pt-2" id="fleet-gallery">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-[#C51616] tracking-wider uppercase">
              {locale === "en" ? "Real Fleet Photos" : "අප සතු සැබෑ රථ වාහන"}
            </span>
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-[var(--ink)] m-0">
              {locale === "en"
                ? `Our Vehicle Fleet Gallery (${FLEET_GALLERY.length} Vehicles)`
                : `අපගේ රථ වාහන එකතුව (${FLEET_GALLERY.length})`}
            </h2>
          </div>
          <span className="text-xs text-[var(--mut)] font-bold">
            {locale === "en" ? "Click any photo to view full size" : "ලොකු කර බැලීමට ඡායාරූපය මත ක්ලික් කරන්න"}
          </span>
        </div>

        {/* 12 Normal Images Clean Modern Responsive Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
          {FLEET_GALLERY.map((item, index) => (
            <div
              key={item.id}
              onClick={() => openLightbox(index)}
              className="relative h-60 sm:h-64 w-full rounded-2xl overflow-hidden bg-neutral-200 border border-[var(--line)] shadow-xs hover:shadow-xl transition-all duration-300 group cursor-pointer"
            >
              <Image
                src={item.src}
                alt={item.alt}
                fill
                loading="eager"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                className="object-cover object-center transition-transform duration-500 group-hover:scale-106"
              />

              {/* Clean Subtle Gradient Overlay on Hover */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-300" />

              {/* Quick Zoom Icon in corner on hover */}
              <div className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-white/95 text-[#26231B] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-md">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"
                  />
                </svg>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. 24/7 HOTLINE CONTACT ACTION BANNER (With Public Image Background) */}
      <section
        className="relative rounded-2xl sm:rounded-3xl overflow-hidden text-[#F6F1DF] p-6 sm:p-8 lg:p-10 border border-[#4A4332] shadow-xl flex flex-col lg:flex-row items-center justify-between gap-6 group"
        id="contact-banner"
      >
        {/* Background Fleet Image & Dark Tint Overlay */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/img2.jpeg"
            alt="Sithumina Transport fleet - Kiribathgoda, Kadawatha and Colombo lorry service"
            fill
            className="object-cover object-center transform scale-102 group-hover:scale-105 transition-transform duration-700"
            sizes="(max-width: 1280px) 100vw, 1200px"
          />
          {/* Multi-stop dark gradient for rich cinematic depth and crystal-clear text contrast */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#14120D]/96 via-[#1C1811]/90 to-[#14120D]/88 backdrop-blur-[1.5px]" />
        </div>

        <div className="relative z-10 flex flex-col gap-2 max-w-xl text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#352E12]/90 backdrop-blur-xs text-[#FFC20E] text-xs font-bold w-fit mx-auto lg:mx-0 border border-[#FFC20E]/50 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              {locale === "en"
                ? "24 Hours Courteous & Prompt Service"
                : "පැය 24 පුරා ආචාරශීලී හා කඩිනම් සේවාව"}
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-white leading-tight m-0 drop-shadow-xs">
            {locale === "en"
              ? "Need Transportation or Moving Services?"
              : "ප්‍රවාහන සේවාවක් හෝ නිවාස/කාර්යාල මාරු කිරීමක් අවශ්‍යද?"}
          </h2>

          <p className="text-xs sm:text-sm text-[#DDD6C1] leading-relaxed m-0 font-normal">
            {locale === "en"
              ? "Contact our courteous dispatch staff 24 hours a day for quick and efficient transport solutions in Kiribathgoda, Kadawatha, Colombo and nearby cities."
              : "කිරිබත්ගොඩ, කඩවත, කොළඹ ඇතුළු ඔබගේ ප්‍රවාහන අවශ්‍යතා ඉක්මනින් හා කාර්යක්ෂමව ඉටුකර ගැනීමට අපගේ සුහදශීලී සේවක මඩුල්ල අමතන්න."}
          </p>

          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-2 text-xs font-mono font-bold text-[#FFC20E]">
            <a href="tel:0112984984" className="hover:underline flex items-center gap-1.5 transition-colors">
              {/* Phone SVG */}
              <svg className="w-3.5 h-3.5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span>0112 984 984</span>
            </a>
            <a
              href="https://wa.me/94755984984"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline text-emerald-400 flex items-center gap-1.5 transition-colors"
            >
              {/* WhatsApp brand SVG */}
              <svg className="w-3.5 h-3.5 fill-current flex-none" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm5.78 14.16c-.24.68-1.4 1.26-1.94 1.33-.51.07-1.16.1-3.37-.8-2.82-1.15-4.64-4.04-4.78-4.23-.14-.19-1.15-1.53-1.15-2.92 0-1.39.73-2.07.99-2.36.26-.29.58-.36.77-.36.2 0 .39 0 .56.01.18.01.42-.07.65.49.24.58.82 2.01.89 2.16.07.15.12.33.02.53-.1.2-.15.32-.3.49-.15.17-.31.38-.45.51-.15.15-.3.32-.13.62.17.29.76 1.25 1.63 2.03 1.12 1 2.06 1.31 2.36 1.45.29.15.46.13.63-.07.17-.2.74-.86.94-1.16.2-.29.39-.24.66-.14.27.1 1.72.81 2.02.96.29.15.49.22.56.34.07.12.07.71-.17 1.39z" />
              </svg>
              <span>0755 984 984 (WhatsApp)</span>
            </a>
          </div>
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto flex-none">
          <Link
            href="/book-vehicle"
            className="w-full sm:w-auto text-center px-6 py-3.5 rounded-xl bg-[var(--y)] hover:bg-[#E5AC0D] text-[#26231B] font-black text-sm no-underline shadow-md transition-all active:scale-95"
          >
            {locale === "en" ? "Book a Vehicle" : "වාහනයක් වෙන්කරන්න"}
          </Link>
          <Link
            href="/contact"
            className="w-full sm:w-auto text-center px-6 py-3.5 rounded-xl bg-white/10 backdrop-blur-xs border-2 border-[var(--y)] text-[#FFC20E] hover:bg-[#FFC20E]/20 font-bold text-sm no-underline transition-all"
          >
            {locale === "en" ? "Contact Staff" : "කාර්ය මණ්ඩලය අමතන්න"}
          </Link>
        </div>
      </section>

      {/* 7. CLEAN LIGHTBOX MODAL */}
      {selectedImageIndex !== null && (
        <div
          className="fixed inset-0 z-[10000] bg-black/95 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={closeLightbox}
            aria-label="Close"
            className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xl font-bold cursor-pointer border-0 transition-colors"
          >
            ✕
          </button>

          {/* Prev button */}
          <button
            type="button"
            onClick={prevImage}
            aria-label="Previous Image"
            className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-50 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center text-xl font-bold cursor-pointer border-0 transition-colors"
          >
            ‹
          </button>

          {/* Next button */}
          <button
            type="button"
            onClick={nextImage}
            aria-label="Next Image"
            className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-50 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center text-xl font-bold cursor-pointer border-0 transition-colors"
          >
            ›
          </button>

          {/* Image Container */}
          <div
            className="relative max-w-5xl w-full h-[70vh] sm:h-[80vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={FLEET_GALLERY[selectedImageIndex].src}
              alt={FLEET_GALLERY[selectedImageIndex].alt}
              fill
              className="object-contain"
              priority
            />
          </div>

          {/* Counter pill */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full bg-black/60 text-white/90 text-xs font-mono font-bold border border-white/20">
            {selectedImageIndex + 1} / {FLEET_GALLERY.length}
          </div>
        </div>
      )}
    </main>
  );
}