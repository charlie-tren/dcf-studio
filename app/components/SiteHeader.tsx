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
          className="text-xl font-semibold tracking-tight text-white transition-colors hover:text-[var(--accent)]"
        >
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
