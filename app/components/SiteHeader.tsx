'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TickerSearch } from './TickerSearch';

/**
 * The search sits in the header on a company page. Until 28/08/2026 the only route
 * back to it was clicking the wordmark, which is a home link rather than an obvious
 * "look something else up" - so having valued one company you had to guess your way
 * back to the field. Now you never leave it.
 *
 * Hidden on the landing page and the methodology page: the landing page IS the search
 * at full size, and two of the same field on one screen is worse than none.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const onCompanyPage = pathname !== '/' && pathname !== '/methodology';

  return (
    <header className="border-b border-[var(--border)]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-5">
        <Link
          href="/"
          className="flex items-center gap-[0.35em] text-xl font-semibold tracking-tight text-white transition-colors hover:text-[var(--accent)]"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[0.95em] w-[0.95em] flex-none -translate-y-[0.04em] text-[var(--accent)]">
            <rect x="2" y="12" width="3.8" height="8" rx="1" fill="currentColor" />
            <rect x="7.2" y="9" width="3.8" height="11" rx="1" fill="currentColor" opacity=".8" />
            <rect x="12.4" y="6.5" width="3.8" height="13.5" rx="1" fill="currentColor" opacity=".6" />
            <rect x="17.6" y="4" width="3.8" height="16" rx="1" fill="currentColor" opacity=".4" />
          </svg>
          DCF Studio
        </Link>
        {onCompanyPage && (
          <div className="order-last w-full sm:order-none sm:w-auto">
            <TickerSearch compact />
          </div>
        )}
        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/methodology"
            className="text-[var(--text-dim)] transition-colors hover:text-[var(--text)]"
          >
            Methodology
          </Link>
          {/* A sibling site, so it sits beside Other projects and reads as navigation.
              No arrow: the arrow there means up a level, and this one goes sideways. */}
          <a
            href="https://charlietrenorden.com/crosscheck/"
            className="text-[var(--text-dim)] transition-colors hover:text-[var(--text)]"
          >
            Crosscheck
          </a>
          <a
            href="https://charlietrenorden.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--text-dim)] transition-colors hover:text-[var(--text)]"
          >
            <span aria-hidden="true">←</span>&nbsp;Other projects
          </a>
        </nav>
      </div>
    </header>
  );
}
