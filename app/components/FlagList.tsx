import type { DataQualityFlag } from '@/lib/types';

const STYLES: Record<DataQualityFlag['severity'], string> = {
  error: 'border-red-300 bg-red-50 text-red-900',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-neutral-300 bg-neutral-50 text-neutral-700',
};

const ORDER: DataQualityFlag['severity'][] = ['error', 'warn', 'info'];

export function FlagList({ flags }: { flags: DataQualityFlag[] }) {
  if (flags.length === 0) return null;
  const sorted = [...flags].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));

  return (
    <div className="space-y-2">
      {sorted.map((flag, i) => (
        <p key={`${flag.code}-${i}`} className={`rounded border px-4 py-3 text-sm ${STYLES[flag.severity]}`}>
          {flag.message}
        </p>
      ))}
    </div>
  );
}
