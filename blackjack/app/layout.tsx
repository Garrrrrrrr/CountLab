import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { AuthProvider } from "@/lib/supabase/AuthProvider";
import { AnalyticsProvider } from "@/lib/analytics";
import { PAGES } from "@/lib/routes";

const SITE_URL = "https://countlab.ca";
const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "CountLab",
  title: { default: "CountLab · Card counting trainer", template: "%s · CountLab" },
  description: PAGES["/"].description,
  openGraph: { title: "CountLab · Card counting trainer", description: PAGES["/"].description, url: SITE_URL, siteName: "CountLab", locale: "en_CA", type: "website" },
  twitter: { card: "summary_large_image", title: "CountLab · Card counting trainer", description: PAGES["/"].description },
  // iOS flattens home-screen icons onto black, so the apple icon is a dedicated opaque PNG.
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "CountLab", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F5F1" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0D11" },
  ],
  // The shell pads for the notch and home indicator, which needs `cover` to resolve the insets.
  viewportFit: "cover",
};

/**
 * Runs before first paint so the saved theme and motion preference never
 * flash. The theme key is device-wide on purpose: it has to be readable before
 * the account (and its synced settings) is known.
 */
const BOOT = `try{var t=localStorage.getItem("countlab:theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;if(localStorage.getItem("countlab:motion")==="off")document.documentElement.dataset.motion="off"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: BOOT }} /></head>
      <body>
        <AuthProvider>
          <AnalyticsProvider>
            <AppShell>{children}</AppShell>
          </AnalyticsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
