'use client';

// TEC Explorer — Economic Discovery Infrastructure (C-108). Make the Pi economy
// discoverable: search Pi-accepting businesses, services, and opportunities by
// text, category, and area, ranked trust-first. Explorer OWNS the index + search;
// it presents KYC verification (tec-kyc-service) and trust (Connection, C-107) —
// it never mints them (C-108 §4). This V1 searches a curated read-only sample
// via /api/bff/explorer/search; a real index lands in Phase 1+.
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePiAuth } from '@yasser172/tec-auth';
import { TEC_COLORS } from '@yasser172/tec-ui';
import { ExplorerPro } from './components/ExplorerPro';
import { ListingPanel } from './components/ListingPanel';
import {
  DIRECTORY, CATEGORIES, CATEGORY_META, searchDirectory,
  type Category, type Listing,
} from '@/lib/explorer/directory';

export default function ExplorerHome() {
  const { user, isLoading, isAuthenticated } = usePiAuth();
  const name = user?.piUsername ? `@${user.piUsername}` : 'there';

  const [query,    setQuery]    = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [listings, setListings] = useState<Listing[]>(DIRECTORY);
  const [source,   setSource]   = useState<'sample' | 'live'>('sample');

  // Fetch from the BFF (serves the sample today; a real index later). Debounced.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams();
        if (query.trim()) qs.set('q', query.trim());
        if (category !== 'all') qs.set('category', category);
        const res  = await fetch(`/api/bff/explorer/search?${qs.toString()}`, { credentials: 'include' });
        const data = await res.json().catch(() => null);
        if (!alive || !data || !Array.isArray(data.results)) return;
        setListings(data.results as Listing[]);
        setSource(data.source === 'live' ? 'live' : 'sample');
      } catch {
        // Fail-safe: rank locally so discovery is never blank.
        if (alive) setListings(searchDirectory({ query, category }));
      }
    }, 180);
    return () => { alive = false; clearTimeout(t); };
  }, [query, category]);

  const count = listings.length;
  const verifiedCount = useMemo(() => listings.filter((l) => l.verification === 'verified').length, [listings]);

  const card: React.CSSProperties = {
    background: TEC_COLORS.surface, border: `1px solid ${TEC_COLORS.gold}22`,
    borderRadius: 12, padding: 14, display: 'block', textDecoration: 'none',
  };
  const chip = (active: boolean): React.CSSProperties => ({
    fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
    color: active ? '#0a0800' : TEC_COLORS.text,
    background: active ? `linear-gradient(135deg, ${TEC_COLORS.gold}, ${TEC_COLORS.goldDark})` : 'transparent',
    border: `1px solid ${TEC_COLORS.gold}${active ? '' : '33'}`,
    borderRadius: 999, padding: '6px 12px', cursor: 'pointer',
  });

  return (
    <main style={{ minHeight: '100vh', background: TEC_COLORS.bg, color: TEC_COLORS.text, padding: '32px 22px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <header>
          <div style={{ fontSize: 12, letterSpacing: 1, color: TEC_COLORS.subtext, textTransform: 'uppercase' }}>TEC Explorer · Discovery</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: TEC_COLORS.gold, margin: '6px 0 0' }}>
            {isLoading ? 'Discover the Pi economy' : `Discover, ${name}`}
          </h1>
          <p style={{ fontSize: 14, color: TEC_COLORS.subtext, margin: '6px 0 0', lineHeight: 1.6 }}>
            Find Pi-accepting businesses, services, and opportunities near you —
            ranked trust-first. Explorer indexes and presents; verification comes
            from KYC and trust from Connection (C-108).
          </p>
        </header>

        {/* Search */}
        <div style={{ marginTop: 20 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search businesses, services, opportunities…"
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 12,
              background: TEC_COLORS.surface, color: TEC_COLORS.text,
              border: `1px solid ${TEC_COLORS.gold}33`, fontSize: 14,
            }}
          />
        </div>

        {/* Category chips */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto', paddingBottom: 4 }}>
          <button style={chip(category === 'all')} onClick={() => setCategory('all')}>All</button>
          {CATEGORIES.map((c) => (
            <button key={c} style={chip(category === c)} onClick={() => setCategory(c)}>
              {CATEGORY_META[c].icon} {CATEGORY_META[c].label}
            </button>
          ))}
        </div>

        {/* Explorer Business Pro — real Pi U2A payment (service subscription). */}
        <ExplorerPro />

        {/* Self-listing (C-108) — list + edit your own business (signed-in only). */}
        <ListingPanel isAuth={isAuthenticated} />

        {/* Results */}
        <section style={{ marginTop: 26 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: TEC_COLORS.text, margin: 0 }}>
              {count} result{count === 1 ? '' : 's'}
            </h2>
            <span style={{ fontSize: 11, color: TEC_COLORS.subtext, border: `1px solid ${TEC_COLORS.gold}33`, borderRadius: 999, padding: '2px 10px' }}>
              {source === 'live' ? 'live index' : 'sample directory'} · {verifiedCount} verified
            </span>
          </div>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {listings.map((l) => (
              <Link key={l.id} href={`/business/${l.id}`} style={card}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: TEC_COLORS.text }}>
                    {CATEGORY_META[l.category].icon} {l.name}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap', color: l.verification === 'verified' ? TEC_COLORS.gold : TEC_COLORS.subtext, border: `1px solid ${l.verification === 'verified' ? TEC_COLORS.gold + '55' : TEC_COLORS.subtext + '55'}`, borderRadius: 999, padding: '2px 8px' }}>
                    {l.verification === 'verified' ? '✅ Verified' : 'Unverified'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: TEC_COLORS.gold, marginTop: 3 }}>
                  {CATEGORY_META[l.category].label} · {l.area} · {l.piAccepted ? 'π accepted' : 'Pi soon'}
                </div>
                <div style={{ fontSize: 12, color: TEC_COLORS.subtext, marginTop: 5, lineHeight: 1.5 }}>{l.summary}</div>
              </Link>
            ))}
            {count === 0 && (
              <div style={{ ...card, textAlign: 'center', color: TEC_COLORS.subtext, fontSize: 13 }}>
                No matches. Try a different term or category.
              </div>
            )}
          </div>
        </section>

        <p style={{ fontSize: 11, color: TEC_COLORS.subtext, margin: '24px 0 0', lineHeight: 1.5 }}>
          Explorer indexes public, self-declared business info and presents it. It never
          mints verification (→ tec-kyc-service), computes trust (→ Connection, C-107),
          processes merchant payments (→ tec-payment-service), or stores your location
          (used for search only, C-108 §6).
        </p>
      </div>
    </main>
  );
}
