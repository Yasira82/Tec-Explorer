// TEC Explorer — business listing detail (C-108). Read-only view of one
// Pi-accepting business/opportunity. Explorer PRESENTS the listing; verification
// is from tec-kyc-service and trust from Connection (C-107) — never minted here
// (C-108 §4). No payment happens in Explorer: the user transacts AT the business
// via tec-payment-service (C-108 §4). Discovery → transaction → trust → retention.
import Link from 'next/link';
import type { Metadata } from 'next';
import { TEC_COLORS } from '@yasser172/tec-ui';
import { CATEGORY_META } from '@/lib/explorer/directory';
import { resolveBusiness } from '@/lib/explorer/server';

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
  const { listing: l, source } = await resolveBusiness(id);

  const wrap: React.CSSProperties = {
    minHeight: '100vh', background: TEC_COLORS.bg, color: TEC_COLORS.text,
    padding: '32px 22px', fontFamily: 'system-ui, -apple-system, sans-serif',
  };
  const inner: React.CSSProperties = { maxWidth: 680, margin: '0 auto' };

  if (!l) {
    const unavailable = source === 'unavailable';
    return (
      <main style={wrap}>
        <div style={inner}>
          <Link href="/app" style={{ fontSize: 13, color: TEC_COLORS.gold, textDecoration: 'none' }}>← Discover</Link>
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

  const meta = CATEGORY_META[l.category];
  const verified = l.verification === 'verified';

  const factCard: React.CSSProperties = {
    background: TEC_COLORS.surface, border: `1px solid ${TEC_COLORS.gold}22`,
    borderRadius: 12, padding: 14,
  };

  return (
    <main style={wrap}>
      <div style={inner}>
        <Link href="/app" style={{ fontSize: 13, color: TEC_COLORS.gold, textDecoration: 'none' }}>← Discover</Link>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1, color: TEC_COLORS.subtext, textTransform: 'uppercase' }}>
              {meta.icon} {meta.label} · {l.area}
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: TEC_COLORS.text, margin: '4px 0 0' }}>{l.name}</h1>
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: verified ? '#0a0800' : TEC_COLORS.text, background: verified ? `linear-gradient(135deg, ${TEC_COLORS.gold}, ${TEC_COLORS.goldDark})` : 'transparent', border: verified ? 'none' : `1px solid ${TEC_COLORS.subtext}66`, borderRadius: 999, padding: '6px 12px', whiteSpace: 'nowrap' }}>
            {verified ? '✅ Verified business' : 'Verification pending'}
          </div>
        </div>

        <p style={{ fontSize: 14, color: TEC_COLORS.subtext, margin: '14px 0 0', lineHeight: 1.6 }}>{l.summary}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 20 }}>
          <div style={factCard}>
            <div style={{ fontSize: 13, fontWeight: 800, color: TEC_COLORS.text }}>💠 Pi payments</div>
            <div style={{ fontSize: 12, color: TEC_COLORS.subtext, marginTop: 5, lineHeight: 1.5 }}>
              {l.piAccepted ? 'Accepts Pi. You pay AT the business via tec-payment-service — not in Explorer (C-108 §4).' : 'Pi acceptance coming soon.'}
            </div>
          </div>
          <div style={factCard}>
            <div style={{ fontSize: 13, fontWeight: 800, color: TEC_COLORS.text }}>🛡️ Verification</div>
            <div style={{ fontSize: 12, color: TEC_COLORS.subtext, marginTop: 5, lineHeight: 1.5 }}>
              {verified ? 'KYC-verified via tec-kyc-service. Explorer presents this badge — it never mints it.' : 'Not yet KYC-verified. Explorer never self-certifies a business.'}
            </div>
          </div>
          <div style={factCard}>
            <div style={{ fontSize: 13, fontWeight: 800, color: TEC_COLORS.text }}>🤝 Trust</div>
            <div style={{ fontSize: 12, color: TEC_COLORS.subtext, marginTop: 5, lineHeight: 1.5 }}>
              {l.trustHint} — the real trust score is owned by Connection (C-107), not Explorer.
            </div>
          </div>
        </div>

        {l.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
            {l.tags.map((t) => (
              <span key={t} style={{ fontSize: 11, color: TEC_COLORS.gold, border: `1px solid ${TEC_COLORS.gold}33`, borderRadius: 999, padding: '3px 10px' }}>#{t}</span>
            ))}
          </div>
        )}

        <p style={{ fontSize: 11, color: TEC_COLORS.subtext, margin: '22px 0 0', lineHeight: 1.5 }}>
          This is a read-only listing. Explorer indexes public, self-declared
          business info and presents it — it never mints verification (→ tec-kyc-service),
          computes trust (→ Connection), or processes payments (→ tec-payment-service).
        </p>
      </div>
    </main>
  );
}
