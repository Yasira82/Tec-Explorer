'use client';

// TEC Explorer — Economic Discovery Infrastructure (C-108). Make the Pi economy
// discoverable: search Pi-accepting businesses, services, and opportunities by
// text, category, and area, ranked trust-first. Explorer OWNS the index + search;
// it presents KYC verification (tec-kyc-service) and trust (Connection, C-107) —
// it never mints them (C-108 §4). App shell: Discover / My Business / Pro / Settings.
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePiAuth } from '@yasser172/tec-auth';
import { useMe } from '@/lib-client/hooks/useMe';
import { useTranslation } from '@/lib/i18n';
import { TEC_COLORS } from '@yasser172/tec-ui';
import { ExplorerPro } from './components/ExplorerPro';
import { ListingPanel } from './components/ListingPanel';
import { BottomNav, type ExpTab } from './components/BottomNav';
import { SettingsView } from './components/SettingsView';
import {
  CATEGORIES, CATEGORY_META,
  type Category, type Listing,
} from '@/lib/explorer/directory';

export default function ExplorerHome() {
  const { user, isLoading, isAuthenticated } = usePiAuth();
  const me = useMe(); // server-resolved Pi username (Pi Browser hides tec_user from client JS — C-123 §3)
  const { t } = useTranslation();
  const [tab, setTab] = useState<ExpTab>('discover');

  const piName = me.username ?? user?.piUsername ?? null;
  const name = piName ? `@${piName}` : '';

  const [query,    setQuery]    = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [listings, setListings] = useState<Listing[]>([]);
  // Real data end-to-end (C-135 §4): live results or an honest empty/error state —
  // never a fabricated directory on screen.
  const [status,   setStatus]   = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload,   setReload]   = useState(0);

  // Fetch from the BFF (the real Explorer index via the gateway). Debounced.
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const qs = new URLSearchParams();
        if (query.trim()) qs.set('q', query.trim());
        if (category !== 'all') qs.set('category', category);
        const res  = await fetch(`/api/bff/explorer/search?${qs.toString()}`, { credentials: 'include' });
        const data = await res.json().catch(() => null);
        if (!alive) return;
        if (data && data.source === 'live' && Array.isArray(data.results)) {
          setListings(data.results as Listing[]);
          setStatus('ready');
        } else {
          setListings([]);
          setStatus('error');
        }
      } catch {
        if (alive) { setListings([]); setStatus('error'); }
      }
    }, 180);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, category, reload]);

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

  const title =
    tab === 'listing' ? t.explorer.nav.listing
    : tab === 'pro' ? t.explorer.nav.pro
    : tab === 'settings' ? t.explorer.nav.settings
    : (isLoading || !name ? t.explorer.discover : t.explorer.discoverName.replace('{name}', name));

  return (
    <main style={{ minHeight: '100vh', background: TEC_COLORS.bg, color: TEC_COLORS.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 22px calc(96px + env(safe-area-inset-bottom))' }}>
        <header>
          <div style={{ fontSize: 12, letterSpacing: 1, color: TEC_COLORS.subtext, textTransform: 'uppercase' }}>{t.explorer.brand}</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: TEC_COLORS.gold, margin: '6px 0 0' }}>{title}</h1>
          {tab === 'discover' && (
            <p style={{ fontSize: 14, color: TEC_COLORS.subtext, margin: '6px 0 0', lineHeight: 1.6 }}>{t.explorer.subtitle}</p>
          )}
        </header>

        {tab === 'discover' && (
          <>
            {/* Search */}
            <div style={{ marginTop: 20 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.explorer.searchPlaceholder}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 12,
                  background: TEC_COLORS.surface, color: TEC_COLORS.text,
                  border: `1px solid ${TEC_COLORS.gold}33`, fontSize: 14,
                }}
              />
            </div>

            {/* Category chips */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto', paddingBottom: 4 }}>
              <button style={chip(category === 'all')} onClick={() => setCategory('all')}>{t.explorer.all}</button>
              {CATEGORIES.map((c) => (
                <button key={c} style={chip(category === c)} onClick={() => setCategory(c)}>
                  {CATEGORY_META[c].icon} {CATEGORY_META[c].label}
                </button>
              ))}
            </div>

            {/* Results */}
            <section style={{ marginTop: 26 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: TEC_COLORS.text, margin: 0 }}>
                  {status === 'ready' ? `${count} result${count === 1 ? '' : 's'}` : 'Discover'}
                </h2>
                {status === 'ready' && count > 0 && (
                  <span style={{ fontSize: 11, color: TEC_COLORS.subtext, border: `1px solid ${TEC_COLORS.gold}33`, borderRadius: 999, padding: '2px 10px' }}>
                    live · {verifiedCount} verified
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {status === 'loading' && [0, 1, 2].map((i) => (
                  <div key={i} style={{ ...card, height: 78, opacity: 0.4 }} aria-hidden />
                ))}

                {status === 'error' && (
                  <div style={{ ...card, textAlign: 'center', color: TEC_COLORS.subtext, fontSize: 13 }}>
                    <div>Couldn&apos;t load the directory right now.</div>
                    <button
                      onClick={() => setReload((r) => r + 1)}
                      style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: '#0a0800', background: `linear-gradient(135deg, ${TEC_COLORS.gold}, ${TEC_COLORS.goldDark})`, border: 'none', borderRadius: 999, padding: '7px 16px', cursor: 'pointer' }}
                    >↻ Retry</button>
                  </div>
                )}

                {status === 'ready' && listings.map((l) => (
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
                      {l.featured && <span style={{ marginLeft: 6, color: TEC_COLORS.gold, fontWeight: 800 }}>· ⭐ Featured</span>}
                    </div>
                    <div style={{ fontSize: 12, color: TEC_COLORS.subtext, marginTop: 5, lineHeight: 1.5 }}>{l.summary}</div>
                  </Link>
                ))}

                {status === 'ready' && count === 0 && (
                  <div style={{ ...card, textAlign: 'center', color: TEC_COLORS.subtext, fontSize: 13 }}>
                    {query.trim() || category !== 'all'
                      ? 'No matches. Try a different term or category.'
                      : 'No Pi businesses are listed here yet. Be the first — list your business in “My Business”.'}
                  </div>
                )}
              </div>
            </section>

            <p style={{ fontSize: 11, color: TEC_COLORS.subtext, margin: '24px 0 0', lineHeight: 1.5 }}>
              Explorer helps you discover public, self-declared businesses. It doesn&apos;t
              verify them, score their trust, or handle payments — those happen at the
              business. Your location is used for search only and never stored.
            </p>
          </>
        )}

        {tab === 'listing' && (
          /* Self-listing (C-108) — list + edit your own business.
             `me.authenticated` FIRST and `isAuthenticated` only as a fallback:
             usePiAuth reads document.cookie, and Pi Browser hides tec_user from
             client JS (C-123 §3), so on the platform this app actually ships to
             it is always false. Passing it alone rendered an EMPTY tab for every
             signed-in user — the same reason `useMe` exists for the greeting
             above. SettingsView already merges the two; this call site did not. */
          <ListingPanel isAuth={me.authenticated || isAuthenticated} authLoading={me.loading} />
        )}

        {tab === 'pro' && (
          /* Explorer Business Pro — real Pi U2A payment (service subscription). */
          <ExplorerPro />
        )}

        {tab === 'settings' && <SettingsView />}
      </div>

      <BottomNav active={tab} onSelect={setTab} />
    </main>
  );
}
