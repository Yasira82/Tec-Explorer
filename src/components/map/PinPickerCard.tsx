'use client';

// The client wrapper that lets the pin picker be used from anywhere.
//
// `dynamic(..., { ssr: false })` may only be called from a client component,
// and Leaflet reaches for `window` at MODULE scope — so importing it normally
// breaks the build rather than just the render. Same shape as BusinessMapCard.
import dynamic from 'next/dynamic';
import { C, goldA } from '@/lib-client/palette';
import type { PinPickerProps } from './PinPicker';

const PinPicker = dynamic(() => import('./PinPicker'), {
  ssr: false,
  loading: () => (
    <div style={{
      height: 260, borderRadius: 10, display: 'grid', placeItems: 'center',
      background: C.surface2, border: `1px solid ${goldA(0.13)}`,
      color: C.subtext, fontSize: 13,
    }}>📍 ···</div>
  ),
});

export function PinPickerCard(props: PinPickerProps) {
  return <PinPicker {...props} />;
}
