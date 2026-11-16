import type { Metadata, Viewport } from "next";
import { Newsreader, Outfit } from "next/font/google";
import { Suspense } from "react";

import { HeaderFallback, SiteHeader } from "@/components/SiteHeader";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  title: {
    default: "Daily Logical Reasoning",
    template: "%s · Daily LR",
  },
  description: "One LSAT-style Logical Reasoning question a day. Not official LSAC material.",
  applicationName: "Daily LR",
  appleWebApp: {
    capable: true,
    title: "Daily LR",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#1c1915",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} ${newsreader.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Suspense fallback={<HeaderFallback />}>
          <SiteHeader />
        </Suspense>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
