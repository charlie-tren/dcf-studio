'use client';

import { useState } from 'react';
import type { Valuation } from '@/lib/valuation';

export function ExportButton({ valuation }: { valuation: Valuation }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const { buildBankWorkbook, buildWorkbook } = await import('@/lib/workbook');
      const buffer = valuation.excessReturns ? await buildBankWorkbook(valuation) : await buildWorkbook(valuation);
      const blob = new Blob([buffer as ArrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${valuation.fundamentals.ticker.replace(/[^A-Z0-9.]/gi, '')}-dcf.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-md border border-[var(--border-strong)] px-4 py-2 text-sm text-[var(--text-dim)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)]"
    >
      Download as Excel
      <span aria-hidden="true">↓</span>
    </button>
  );
}
