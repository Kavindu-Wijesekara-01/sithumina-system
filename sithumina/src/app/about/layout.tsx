import type { Metadata } from "next";

// TODO: replace with your real domain
const SITE_URL = "https://www.yourdomain.lk";

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title:
        "Sithumina Transport | Kiribathgoda, Kadawatha & Colombo Lorry & Cargo Transport",
    description:
        "Sithumina Transport – trusted Kiribathgoda transport, Kadawatha transport, Colombo cargo transport and lorry hire service. House & office moving, island-wide cargo, refrigerated trucks and A/C buses. 24/7 service covering Colombo, Kelaniya, Wattala, Kiribathgoda and Kadawatha.",
    keywords: [
        "kiribathgoda transport",
        "kadawatha transport",
        "kiribathgoda cargo transport",
        "colombo cargo transport",
        "colombo transport",
        "colombo lorry",
        "kadawatha lorry",
        "kiribathgoda lorry",
        "kelaniya transport",
        "wattala transport",
        "lorry hire colombo",
        "house moving colombo",
        "office moving sri lanka",
        "cargo transport sri lanka",
        "freezer lorry sri lanka",
        "Sithumina Transport",
        "කිරිබත්ගොඩ ට්‍රාන්ස්පෝර්ට්",
        "කඩවත ට්‍රාන්ස්පෝර්ට්",
        "කොළඹ ලොරි",
        "කඩවත ලොරි",
        "කිරිබත්ගොඩ ලොරි",
    ],
    alternates: {
        canonical: "/about",
    },
    openGraph: {
        type: "website",
        url: "/about",
        siteName: "Sithumina Transport",
        title:
            "About Sithumina Transport | Colombo, Kiribathgoda & Kadawatha Lorry & Cargo Service",
        description:
            "24/7 lorry hire, cargo transport, house & office moving and passenger bus service in Colombo, Kiribathgoda, Kadawatha, Kelaniya, Wattala and islandwide.",
        images: [{ url: "/img2.jpeg", width: 1200, height: 630, alt: "Sithumina Transport lorry fleet" }],
        locale: "en_LK",
    },
    twitter: {
        card: "summary_large_image",
        title: "Sithumina Transport | Colombo, Kiribathgoda & Kadawatha",
        description:
            "Lorry hire, cargo transport, house moving & bus service – Colombo, Kiribathgoda, Kadawatha, Kelaniya, Wattala.",
        images: ["/img2.jpeg"],
    },
    robots: { index: true, follow: true },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}