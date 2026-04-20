'use client';

import dynamic from 'next/dynamic';

const TransitMap = dynamic(() => import('@/components/TransitMap'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        color: '#94a3b8',
      }}
    >
      Loading Wombarra Transit Monitor...
    </div>
  ),
});

export default function Page() {
  return (
    <main>
      <TransitMap />
    </main>
  );
}
