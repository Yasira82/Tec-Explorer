// TEC Explorer — business listing detail (C-108). Read-only view of one
// Pi-accepting business/opportunity. Explorer PRESENTS the listing; verification
// is from tec-kyc-service and trust from Connection (C-107) — never minted here
// (C-108 §4). No payment happens in Explorer: the user transacts AT the business
// via tec-payment-service (C-108 §4). Discovery → transaction → trust → retention.
//
// This file is deliberately thin. It FETCHES (server-side, with the internal
// key) and hands the result to `BusinessView`, a client component, because the
// chosen locale lives in localStorage and a server cannot read it — anything
// rendered here could never be in Arabic.
//
// Keeping it thin has a second benefit worth stating, because getting it wrong
// already cost a production outage: a Server Component must not call a function
// imported from a `'use client'` module. Next turns those exports into client
// REFERENCES and calling one throws at request time. The less this file does,
// the fewer chances there are to reintroduce that.
import Link from 'next/link';
import type { Metadata } from 'next';
import { TEC_COLORS } from '@yasser172/tec-ui';
import { resolveBusiness, resolveOwnerProfile } from '@/lib/explorer/server';
import { BusinessView } from '@/components/business/BusinessView';

// The live search module is the index of record (C-108 §5) — every business page
// renders on demand from it; nothing is pre-baked from a curated sample.
// force-dynamic (and NO generateStaticParams) is REQUIRED: this page does a fresh
// (no-store) backend fetch, so any static prerendering throws "Page changed from
// static to dynamic at runtime" → 500 on every /business/[id]. This is the exact
// production incident this fixes.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title:       'TEC Explorer — Business',
  description: 'Discover Pi-accepting businesses on TEC Explorer.',
};

export default async function BusinessPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Resolve from the live Explorer backend (search module) — real data only; an
  // unreachable backend yields an honest "couldn't load", never a sample (C-135 §4).
  const { listing, source } = await resolveBusiness(id);
  // TEC Connect (C-107 §14.3). Null unless this listing has an owner AND that
  // person has PUBLISHED a Connection profile — listing a shop is not consent to
  // having your personal handle printed beside it. Fails closed to null, so the
  // page simply does not offer to follow anyone.
  const owner = await resolveOwnerProfile(listing?.owner);

  if (!listing) {
    // The two absences are different and are told apart: a live 404 means this
    // business is not listed; an unreachable backend means we do not know. Both
    // are rendered here rather than in the client view, because neither has any
    // listing data to hand down.
    const unavailable = source === 'unavailable';
    return (
      <main style={{
        minHeight: '100vh', background: TEC_COLORS.bg, color: TEC_COLORS.text,
        padding: '32px 22px', fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <Link href="/app" style={{ fontSize: 13, color: TEC_COLORS.gold, textDecoration: 'none' }}>←</Link>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: TEC_COLORS.text, marginTop: 16 }}>
            {unavailable ? "Couldn't load this listing" : 'Listing not found'}
          </h1>
          <p style={{ fontSize: 13, color: TEC_COLORS.subtext }}>
            {unavailable
              ? 'The directory is unavailable right now. Please try again shortly.'
              : <>No business with id <code>{id}</code> is listed here.</>}
          </p>
        </div>
      </main>
    );
  }

  return <BusinessView listing={listing} owner={owner} />;
}
