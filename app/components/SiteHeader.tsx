import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="border-b border-[var(--border)]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="text-base font-semibold tracking-tight text-[var(--text)]">
            DCF Studio
          </span>
          <span className="text-xs text-[var(--text-faint)] transition-colors group-hover:text-[var(--accent)]">
            show me the numbers
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link
            href="/methodology"
            className="text-[var(--text-dim)] transition-colors hover:text-[var(--text)]"
          >
            Methodology
          </Link>
          <a
            href="https://charlie-tren.github.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--text-dim)] transition-colors hover:text-[var(--text)]"
          >
            Other projects
          </a>
        </nav>
      </div>
    </header>
  );
}
