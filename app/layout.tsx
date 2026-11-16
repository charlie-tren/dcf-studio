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

/* The custom domain, not the Vercel origin. Both serve this app, so without a
   canonical they are two indexable copies of every page - and the one people
   are given is dcf.charlietrenorden.com. metadataBase also resolves the
   relative og:image and canonical below, which Next otherwise emits as paths
   that no scraper can fetch. */
const SITE = new URL("https://dcf.charlietrenorden.com");

const DESCRIPTION =
  "Type a company. Get a discounted cashflow valuation built from its reported financials, with every assumption shown.";

/* Written for search and AI answer engines and never shown to a reader (07/10/2026).
   Kept apart from DESCRIPTION, which tools/make_card.py prints onto the share
   card and og/twitter repeat, so the card keeps the line people see. */
const META_DESCRIPTION =
  "Free DCF calculator for listed companies: a discounted cash flow valuation built from reported financials, with WACC, terminal value, sensitivity table and a reverse DCF. ASX, US, London, Tokyo and more.";

export const metadata: Metadata = {
  metadataBase: SITE,
  title: "DCF Studio",
  description: META_DESCRIPTION,
  alternates: { canonical: "/" },
  /* og-card.png is built by tools/make_card.py out of globals.css, and the
     width/height are declared because X and Slack reserve the slot before the
     image arrives; without them a slow fetch collapses the card. */
  openGraph: {
    type: "website",
    siteName: "DCF Studio",
    title: "DCF Studio",
    description: DESCRIPTION,
    url: "/",
    images: [{ url: "/og-card.png", width: 1200, height: 630, alt: "DCF Studio" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "DCF Studio",
    description: DESCRIPTION,
    images: ["/og-card.png"],
  },
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
            . General information, not advice.
          </div>
        </footer>
        {/* Analytics, gated, one inline script instead of two src ones. Feeds the
            private stats dashboard, which runs one account-wide query and splits by
            `requestHost`, so the token is deliberately the same as every other site
            in the estate. Cookieless, and `afterInteractive` keeps it off the
            hydration path exactly as the two tags it replaces did.

            The gate: two kinds of visitor are not an audience and never load either
            beacon. Anyone who has opted out with ?nostats=1, which sets a flag in
            their own browser that ?nostats=0 undoes. And automation, since
            `navigator.webdriver` is the one signal true for Playwright, Puppeteer
            and Selenium alike - this estate drives a headless browser at all twenty
            sites for thumbnails, head checks and mobile audits, and Cloudflare
            bot-flags only some of them. This file is a server component so it cannot
            ask about navigator itself; the gate is a string that runs on the client.
            See site-stats/beacon and its tests/test_gate.py. */}
        <Script id="analytics-gate" strategy="afterInteractive">{`
          (function(){try{var X="ct.nostats",C="ct_nostats",
          D=";path=/;domain=.charlietrenorden.com",q=location.search,out=false;
          if(q.indexOf("nostats=1")>-1){try{localStorage.setItem(X,"1")}catch(e){}
          document.cookie=C+"=1"+D+";max-age=63072000;samesite=lax";}
          if(q.indexOf("nostats=0")>-1){try{localStorage.removeItem(X)}catch(e){}
          document.cookie=C+"="+D+";max-age=0";}
          try{out=!!localStorage.getItem(X)}catch(e){}
          if(!out)out=document.cookie.indexOf(C+"=1")>-1;
          if(out||navigator.webdriver)return;
          var E=["pointermove","pointerdown","scroll","keydown","touchstart","wheel"],go=function(){if(go.d)return;go.d=1;E.forEach(function(e){removeEventListener(e,go,true)});
          var d=document,s;
          s=d.createElement("script");s.defer=true;
          s.src="https://static.cloudflareinsights.com/beacon.min.js";
          s.setAttribute("data-cf-beacon",'{"token": "32b821209b5441a08df42ccf61c9e6c2"}');
          d.head.appendChild(s);
          s=d.createElement("script");s.defer=true;
          s.src="https://beacon.charlietrenorden.com/b.js";
          d.head.appendChild(s);};
          E.forEach(function(e){addEventListener(e,go,{capture:true,passive:true})});
          }catch(e){}})();
        `}</Script>
      </body>
    </html>
  );
}
