import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { AuthProvider } from "@/lib/supabase/AuthProvider";
import { AnalyticsProvider } from "@/lib/analytics";
import { AnalyticsConsent } from "@/components/AnalyticsConsent";
import { InstallPrompt } from "@/components/InstallPrompt";
import { UpdateToast } from "@/components/UpdateToast";

const SITE_URL = "https://countlab.ca";
const DESCRIPTION =
  "Hi-Lo card counting and blackjack decision training: full-shoe practice, basic strategy, index deviations, and a CVCX-style bankroll and risk lab.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "CountLab",
  title: { default: "CountLab · Blackjack Training", template: "%s · CountLab" },
  description: DESCRIPTION,
  openGraph: {
    title: "CountLab · Blackjack Training",
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "CountLab",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CountLab · Blackjack Training",
    description: DESCRIPTION,
  },
  // iOS ignores alpha in home-screen icons and flattens onto black, so the
  // apple icon is a dedicated opaque 180x180 rather than the RGBA icon-192.
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "CountLab", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#101411",
  // The shell already pads for the notch and home indicator. With the
  // translucent status bar this must be enabled for those insets to resolve.
  viewportFit: "cover",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <AuthProvider>
          <AnalyticsProvider>
            <AnalyticsConsent />
            <UpdateToast />
            <InstallPrompt />
            <AuthGate>
              <AppShell>{children}</AppShell>
            </AuthGate>
          </AnalyticsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
