import type { DataQualityFlag } from '@/lib/types';

const STYLES: Record<DataQualityFlag['severity'], string> = {
  error: 'border-l-[var(--negative)] bg-[var(--negative-soft)] text-[var(--text)]',
  warn: 'border-l-[#b08b4f] bg-[rgba(176,139,79,0.10)] text-[var(--text)]',
  info: 'border-l-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-dim)]',
};

const LABEL: Record<DataQualityFlag['severity'], string> = {
  error: 'Wrong tool',
  warn: 'Adjusted',
  info: 'Note',
};

const ORDER: DataQualityFlag['severity'][] = ['error', 'warn', 'info'];

export function FlagList({ flags }: { flags: DataQualityFlag[] }) {
  if (flags.length === 0) return null;
  const sorted = [...flags].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));

  return (
    <div className="space-y-2">
      {sorted.map((flag, i) => (
        <div
          key={`${flag.code}-${i}`}
          className={`rounded-r border-l-2 px-4 py-3 text-sm leading-relaxed ${STYLES[flag.severity]}`}
        >
          <span className="mr-2.5 text-[11px] tracking-wide text-[var(--text-faint)] uppercase">
            {LABEL[flag.severity]}
          </span>
          <span>{flag.message}</span>
        </div>
      ))}
    </div>
  );
}
