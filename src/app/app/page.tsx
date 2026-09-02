'use client';

// TEC Explorer — Economic Discovery Infrastructure (C-108). Make the Pi economy
// discoverable: search Pi-accepting businesses, services, and opportunities by
// text, category, and area, ranked trust-first. Explorer OWNS the index + search;
// it presents KYC verification (tec-kyc-service) and trust (Connection, C-107) —
// it never mints them (C-108 §4). App shell: Discover / My Business / Pro / Settings.
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePiAuth } from '@yasser172/tec-auth';
import { useMe } from '@/lib-client/hooks/useMe';
import { useTranslation } from '@/lib/i18n';
import { ExplorerPro } from './components/ExplorerPro';
import { ListingPanel } from './components/ListingPanel';
import { BottomNav, type ExpTab } from './components/BottomNav';
import { SettingsView } from './components/SettingsView';
import {
  CATEGORIES, CATEGORY_META, mappable,
  type Category, type Listing,
} from '@/lib/explorer/directory';
import { distanceKm, formatDistance, useNearMe } from '@/lib-client/geo';
import { reportError } from '@/lib/observability/reportError';
import { C, goldA } from '@/lib-client/palette';

// Leaflet touches `window` at module scope, so this cannot be server-rendered —
// a plain import breaks the BUILD, not just the render.
const BusinessMap = dynamic(() => import('@/components/map/BusinessMap'), {
  ssr: false,
  loading: () => (
    // Language-neutral: this sits inside `dynamic(..., { loading })` at MODULE
    // scope, where `useTranslation` cannot be called. An English word here would
    // be the one flash of English in an Arabic UI, so the placeholder says the
    // same thing in every language instead.
    <div style={{
      height: 340, borderRadius: 12, display: 'grid', placeItems: 'center',
      background: C.surface, border: `1px solid ${goldA(0.13)}`, color: C.subtext, fontSize: 13,
    }}>🗺️ ···</div>
  ),
});

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
  const [view,     setView]     = useState<'list' | 'map'>('list');

  // "Who near me accepts Pi?" — the position is requested only when the visitor
  // asks (C-108 §6) and NEVER leaves this device: the distance to each business
  // is computed here, against coordinates the merchants published.
  const nearMe = useNearMe();
  const myPosition = nearMe.state.status === 'ready' ? nearMe.state.position : null;

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
      } catch (err) {
        // The screen already says "couldn't load the directory" and offers a
        // retry. This is the other half: without it, the day search breaks for
        // everyone we find out from a screenshot (C-96).
        reportError(err, { where: 'Discover.search', query, category });
        if (alive) { setListings([]); setStatus('error'); }
      }
    }, 180);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, category, reload]);

  // Distance is attached here, in the browser, and only when the visitor asked.
  // Sorting by it beats every other signal: "near me" is the question, so an
  // answer 8 km away is worse than a closer one whatever its trust tier.
  const withDistance = useMemo(() => {
    if (!myPosition) return listings.map((l) => ({ listing: l, km: null as number | null }));
    return listings
      .map((l) => ({
        listing: l,
        km: (typeof l.lat === 'number' && typeof l.lng === 'number')
          ? distanceKm(myPosition, { lat: l.lat, lng: l.lng })
          : null,
      }))
      // Listings with no pin sink to the bottom rather than vanishing: a shop
      // that has not set its location is still a real shop, and dropping it
      // would silently shrink the index the moment someone taps "Near me".
      .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  }, [listings, myPosition]);

  const pins = useMemo(() => mappable(listings), [listings]);
  const openBusiness = useCallback((id: string) => { window.location.href = `/business/${id}`; }, []);

  const count = listings.length;
  const verifiedCount = useMemo(() => listings.filter((l) => l.verification === 'verified').length, [listings]);

  const card: React.CSSProperties = {
    background: C.surface, border: `1px solid ${goldA(0.133)}`,
    borderRadius: 12, padding: 14, display: 'block', textDecoration: 'none',
  };
  const chip = (active: boolean): React.CSSProperties => ({
    fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
    color: active ? C.onGold : C.text,
    background: active ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})` : 'transparent',
    border: `1px solid ${C.gold}${active ? '' : '33'}`,
    borderRadius: 999, padding: '6px 12px', cursor: 'pointer',
  });

  const title =
    tab === 'listing' ? t.explorer.nav.listing
    : tab === 'pro' ? t.explorer.nav.pro
    : tab === 'settings' ? t.explorer.nav.settings
    : (isLoading || !name ? t.explorer.discover : t.explorer.discoverName.replace('{name}', name));

  return (
    <main style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 22px calc(96px + env(safe-area-inset-bottom))' }}>
        <header>
          <div style={{ fontSize: 12, letterSpacing: 1, color: C.subtext, textTransform: 'uppercase' }}>{t.explorer.brand}</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: C.gold, margin: '6px 0 0' }}>{title}</h1>
          {tab === 'discover' && (
            <p style={{ fontSize: 14, color: C.subtext, margin: '6px 0 0', lineHeight: 1.6 }}>{t.explorer.subtitle}</p>
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
                  background: C.surface, color: C.text,
                  border: `1px solid ${goldA(0.2)}`, fontSize: 14,
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

            {/* Near me + list/map. Location is asked for ONLY on this tap
                (C-108 §6) and the answer never leaves the device — every
                distance below is arithmetic done here. */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => (myPosition ? nearMe.clear() : nearMe.request())}
                disabled={nearMe.state.status === 'asking'}
                style={chip(!!myPosition)}
              >
                📍 {nearMe.state.status === 'asking' ? t.explorer.locating : myPosition ? t.explorer.nearMeOn : t.explorer.nearMe}
              </button>
              <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 6 }}>
                <button style={chip(view === 'list')} onClick={() => setView('list')}>☰ {t.explorer.list}</button>
                <button style={chip(view === 'map')} onClick={() => setView('map')}>🗺️ {t.explorer.map}</button>
              </div>
            </div>

            {/* The two refusals need different words: "denied" is a choice the
                visitor made and can undo in browser settings; "unavailable" is a
                device that cannot answer at all, and telling that person to
                "allow location" is advice that cannot work. */}
            {(nearMe.state.status === 'denied' || nearMe.state.status === 'unavailable') && (
              <p style={{ fontSize: 12, color: C.subtext, margin: '8px 0 0', lineHeight: 1.5 }}>
                {nearMe.state.status === 'denied' ? t.explorer.geoDenied : t.explorer.geoUnavailable}
              </p>
            )}

            {/* Results */}
            <section style={{ marginTop: 26 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: 0 }}>
                  {status === 'ready'
                    ? (count === 1 ? t.explorer.resultsOne : t.explorer.results.replace('{n}', String(count)))
                    : t.explorer.discover}
                </h2>
                {status === 'ready' && count > 0 && (
                  <span style={{ fontSize: 11, color: C.subtext, border: `1px solid ${goldA(0.2)}`, borderRadius: 999, padding: '2px 10px' }}>
                    {t.explorer.liveVerified.replace('{n}', String(verifiedCount))}
                  </span>
                )}
              </div>
              {view === 'map' && status === 'ready' && (
                <div style={{ marginTop: 12 }}>
                  <BusinessMap listings={pins} me={myPosition} onOpen={openBusiness} />
                  {pins.length < count && (
                    // Said out loud, because a map showing 3 of 8 results with
                    // no explanation reads as a broken map.
                    <p style={{ fontSize: 11.5, color: C.subtext, margin: '8px 0 0', lineHeight: 1.5 }}>
                      {t.explorer.notOnMap
                        .replace('{n}', String(count - pins.length))
                        .replace('{total}', String(count))}.
                    </p>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {status === 'loading' && [0, 1, 2].map((i) => (
                  <div key={i} style={{ ...card, height: 78, opacity: 0.4 }} aria-hidden />
                ))}

                {status === 'error' && (
                  <div style={{ ...card, textAlign: 'center', color: C.subtext, fontSize: 13 }}>
                    <div>{t.explorer.cantLoad}</div>
                    <button
                      onClick={() => setReload((r) => r + 1)}
                      style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: C.onGold, background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`, border: 'none', borderRadius: 999, padding: '7px 16px', cursor: 'pointer' }}
                    >↻ {t.explorer.retry}</button>
                  </div>
                )}

                {status === 'ready' && view === 'list' && withDistance.map(({ listing: l, km }) => (
                  <Link key={l.id} href={`/business/${l.id}`} style={card}>
                    {l.hasPhoto && (
                                  <img
                        src={`/api/photo/${encodeURIComponent(l.id)}`}
                        alt=""
                        loading="lazy"
                        style={{
                          width: '100%', height: 120, objectFit: 'cover', borderRadius: 8,
                          marginBottom: 10, display: 'block',
                        }}
                      />
                    )}
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
                        {CATEGORY_META[l.category].icon} {l.name}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap', color: l.verification === 'verified' ? C.gold : C.subtext, border: `1px solid ${l.verification === 'verified' ? C.gold + '55' : C.subtext + '55'}`, borderRadius: 999, padding: '2px 8px' }}>
                        {l.verification === 'verified' ? '✅ Verified' : 'Unverified'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: C.gold, marginTop: 3 }}>
                      {CATEGORY_META[l.category].label} · {l.area} · {l.piAccepted ? 'π accepted' : 'Pi soon'}
                      {km !== null && (
                        <span style={{ fontWeight: 800 }}> · {t.explorer.away.replace('{d}', formatDistance(km))}</span>
                      )}
                      {l.featured && <span style={{ marginLeft: 6, color: C.gold, fontWeight: 800 }}>· ⭐ Featured</span>}
                    </div>
                    <div style={{ fontSize: 12, color: C.subtext, marginTop: 5, lineHeight: 1.5 }}>{l.summary}</div>
                  </Link>
                ))}

                {status === 'ready' && view === 'list' && count === 0 && (
                  <div style={{ ...card, textAlign: 'center', color: C.subtext, fontSize: 13 }}>
                    {query.trim() || category !== 'all' ? t.explorer.noMatches : t.explorer.beFirst}
                  </div>
                )}
              </div>
            </section>

            <p style={{ fontSize: 11, color: C.subtext, margin: '24px 0 0', lineHeight: 1.5 }}>
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
