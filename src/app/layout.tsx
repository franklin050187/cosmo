import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Space_Grotesk } from "next/font/google";
import "@/lib/env";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import ErrorBoundary from "@/components/ErrorBoundary";

export const dynamic = "force-dynamic";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "CosmoShip : Cosmoteer Library",
    template: "%s | CosmoShip",
  },
  description:
    "Website for sharing, searching, browsing and downloading ships design for Cosmoteer: Starship Architect & Commander.",
  metadataBase: new URL(process.env.CLIENT_URL || "http://localhost:8000"),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "CosmoShip",
    title: "CosmoShip : Cosmoteer Library",
    description:
      "Website for sharing, searching, browsing and downloading ships design for Cosmoteer: Starship Architect & Commander.",
    images: [{ url: "/favicon/android-chrome-512x512.png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CosmoShip : Cosmoteer Library",
    description:
      "Website for sharing, searching, browsing and downloading ships design for Cosmoteer: Starship Architect & Commander.",
    images: [{ url: "/favicon/android-chrome-512x512.png" }],
    creator: "@CosmoteerGame",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#021526",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://i.ibb.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://i.ibb.co" />
        <link rel="preconnect" href="https://ufs.sh" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://ufs.sh" />
      </head>
      <body className={`${spaceGrotesk.className} min-h-screen flex flex-col`}>
        <ErrorBoundary>
          <Suspense fallback={null}>
            <Header />
          </Suspense>
          <Suspense fallback={null}>
            <AnalyticsTracker />
          </Suspense>
          <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 pt-[72px] pb-20">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
          <Footer />
        </ErrorBoundary>
      </body>
    </html>
  );
}
