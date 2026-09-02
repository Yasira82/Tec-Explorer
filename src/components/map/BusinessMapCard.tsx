'use client';

// A client boundary around the map, so a SERVER component can show one.
//
// `dynamic(..., { ssr: false })` is not allowed inside a Server Component in
// Next 15, and the business page is one. This wrapper is the smallest thing that
// can legally hold the option — it exists for that rule and nothing else.
import dynamic from 'next/dynamic';
import { TEC_COLORS } from '@yasser172/tec-ui';
import type { MappableListing } from './BusinessMap';

const BusinessMap = dynamic(() => import('./BusinessMap'), {
  ssr: false,
  loading: () => (
    <div style={{
      height: 340, borderRadius: 12, display: 'grid', placeItems: 'center',
      background: TEC_COLORS.surface, border: `1px solid ${TEC_COLORS.gold}22`,
      color: TEC_COLORS.subtext, fontSize: 13,
    }}>Loading map…</div>
  ),
});

export function BusinessMapCard({ listing }: { listing: MappableListing }) {
  return (
    <div style={{ marginTop: 12 }}>
      <BusinessMap listings={[listing]} />
    </div>
  );
}
