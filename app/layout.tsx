import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
    "Type a company. Get a discounted cashflow valuation built from its own reported numbers, with every assumption on the surface.",
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
      </body>
    </html>
  );
}
