import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ModelLoading, TickerView } from '../[ticker]/TickerView';

/* The Worker serves this for any ticker not built ahead; the address bar keeps /<ticker>. */
export const metadata: Metadata = { title: 'DCF Studio', robots: { index: false } };

export default function CompanyShell() {
  return (
    <Suspense fallback={<ModelLoading ticker={null} />}>
      <TickerView ticker={null} snapshot={null} initial={null} builtOn={null} />
    </Suspense>
  );
}
