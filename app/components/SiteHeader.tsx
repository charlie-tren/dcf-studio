import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="border-b border-[var(--border)]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-5">
        <Link
          href="/"
          className="text-xl font-semibold tracking-tight text-white transition-colors hover:text-[var(--accent)]"
        >
          DCF Studio
        </Link>
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
