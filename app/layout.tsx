import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { SiteHeader } from "./components/SiteHeader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DCF Studio",
  description:
    "Type a company. Get a discounted cashflow valuation built from its reported financials, with every assumption shown.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <footer className="mt-16 border-t border-[var(--border)]">
          <div className="mx-auto max-w-5xl px-6 py-6 text-xs text-[var(--text-faint)]">
            Built by{' '}
            <a
              href="https://charlietrenorden.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-[var(--text-dim)]"
            >
              Charlie Trenorden
            </a>
            . General information, not advice. Not affiliated with Yahoo.
          </div>
        </footer>
        {/* Cloudflare Web Analytics. Feeds the private stats dashboard, which runs
            one account-wide query and splits by `requestHost`, so this is
            deliberately the same token as every other site in the estate.
            Cookieless. `afterInteractive` keeps it off the hydration path. */}
        <Script
          src="https://static.cloudflareinsights.com/beacon.min.js"
          strategy="afterInteractive"
          data-cf-beacon='{"token": "32b821209b5441a08df42ccf61c9e6c2"}'
        />
      </body>
    </html>
  );
}
