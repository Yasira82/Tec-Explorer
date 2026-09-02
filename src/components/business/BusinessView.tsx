'use client';

// The business page's presentation, in a CLIENT component.
//
// The page itself is a Server Component — it must be, so the listing is fetched
// server-side with the internal key. But the chosen locale lives in
// localStorage, which a server cannot read, so anything rendered on the server
// can never be in Arabic.
//
// This is the smallest split that fixes it: the server fetches and hands the
// data down; everything a person actually READS is rendered here, where
// `useTranslation` works.
import Link from 'next/link';
import { TEC_COLORS } from '@yasser172/tec-ui';
import { useTranslation } from '@/lib/i18n';
import { CATEGORY_META, safeWebsite, telHref, mappable, type Listing } from '@/lib/explorer/directory';
import { FollowOwner } from '@/components/connect/FollowOwner';
import { BusinessMapCard } from '@/components/map/BusinessMapCard';
import { Reviews } from '@/components/reviews/Reviews';
import type { OwnerProfile } from '@/lib/explorer/server';

export function BusinessView({ listing: l, owner }: {
  listing: Listing;
  owner: OwnerProfile | null;
}) {
  const { t } = useTranslation();
  const x = t.explorer;

  const wrap: React.CSSProperties = {
    minHeight: '100vh', background: TEC_COLORS.bg, color: TEC_COLORS.text,
    padding: '32px 22px', fontFamily: 'system-ui, -apple-system, sans-serif',
  };
  const inner: React.CSSProperties = { maxWidth: 680, margin: '0 auto' };

  const meta = CATEGORY_META[l.category];
  const verified = l.verification === 'verified';

  // Merchant-supplied, therefore untrusted, therefore checked HERE and not only
  // where it was written. `safeWebsite` returns null for anything a browser
  // would execute; null simply means the row renders without that line.
  const website = safeWebsite(l.website);
  const tel     = telHref(l.phone);
  // A pin only if the merchant published a complete pair. `mappable` is the same
  // filter the discovery map uses, so one page can never draw a position the
  // other rejects.
  const pin     = mappable([l])[0] ?? null;

  const factCard: React.CSSProperties = {
    background: TEC_COLORS.surface, border: `1px solid ${TEC_COLORS.gold}22`,
    borderRadius: 12, padding: 14,
  };

  return (
    <main style={wrap}>
      <div style={inner}>
        <Link href="/app" style={{ fontSize: 13, color: TEC_COLORS.gold, textDecoration: 'none' }}>{x.backToDiscover}</Link>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1, color: TEC_COLORS.subtext, textTransform: 'uppercase' }}>
              {meta.icon} {meta.label} · {l.area}
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: TEC_COLORS.text, margin: '4px 0 0' }}>{l.name}</h1>
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: verified ? '#0a0800' : TEC_COLORS.text, background: verified ? `linear-gradient(135deg, ${TEC_COLORS.gold}, ${TEC_COLORS.goldDark})` : 'transparent', border: verified ? 'none' : `1px solid ${TEC_COLORS.subtext}66`, borderRadius: 999, padding: '6px 12px', whiteSpace: 'nowrap' }}>
            {verified ? x.verifiedBusiness : x.pendingVerify}
          </div>
        </div>

        {/* The shop itself. A directory of names reads as a spreadsheet; one
            photo is the difference between a listing and a place. Served
            same-origin from /api/photo/<handle> because the bucket is private
            (src/lib/explorer/photo.ts).

            A plain <img>, not next/image: the bytes are already being proxied
            once by this app, and next/image would proxy them a second time and
            need the route registered in `remotePatterns` for no gain. */}
        {l.hasPhoto && (
          <img
            src={`/api/photo/${encodeURIComponent(l.id)}`}
            alt=""
            style={{
              width: '100%', height: 200, objectFit: 'cover', borderRadius: 12,
              marginTop: 16, border: `1px solid ${TEC_COLORS.gold}22`, display: 'block',
            }}
          />
        )}

        <p style={{ fontSize: 14, color: TEC_COLORS.subtext, margin: '14px 0 0', lineHeight: 1.6 }}>{l.summary}</p>

        {/* ── Visit & contact ──────────────────────────────────────────────
            The reason someone opened this page. Before these fields existed the
            page could name a café and then say only that Explorer does not
            verify it, does not score it and does not take the payment — three
            statements about Explorer's architecture on the customer's screen,
            and nothing about the café. Whatever the merchant published comes
            first now; the boundaries are still stated, once, at the bottom
            where a disclaimer belongs.

            Rendered only when there is something to render: an empty "Contact"
            heading is worse than no heading, because it reads as broken rather
            than as absent. */}
        {(l.address || l.hours || website || tel || pin) && (
          <section style={{ ...factCard, marginTop: 20, display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, color: TEC_COLORS.subtext }}>
              {x.visitContact}
            </div>

            {l.address && (
              <Fact icon="📍" label={x.address}>
                <span dir="auto">{l.address}</span>
                {/* A maps link is built from the address TEXT, not from a URL
                    the merchant supplied — so there is no attacker-controlled
                    destination here at all. */}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.address} ${l.area}`)}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ ...linkStyle, marginInlineStart: 8, whiteSpace: 'nowrap' }}
                >{x.directions}</a>
              </Fact>
            )}

            {l.hours && <Fact icon="🕒" label={x.hours}><span dir="auto">{l.hours}</span></Fact>}

            {/* The address in words answers "where", the pin answers "where,
                exactly". Shown only when the merchant set one — an empty map is
                worse than no map. */}
            {pin && <BusinessMapCard listing={pin} />}

            {tel && (
              <Fact icon="📞" label={x.phone}>
                {/* A tel: link is the difference between reading a number and
                    calling the shop. */}
                <a href={tel} style={linkStyle} dir="ltr">{l.phone}</a>
              </Fact>
            )}

            {website && (
              <Fact icon="🌐" label={x.website}>
                {/* rel="noopener": without it the opened page inherits
                    window.opener and can navigate this tab elsewhere
                    (reverse tabnabbing) — on a page full of merchant-supplied
                    links, that is a phishing primitive. */}
                <a href={website} target="_blank" rel="noopener noreferrer nofollow" style={linkStyle} dir="ltr">
                  {website.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗
                </a>
              </Fact>
            )}
          </section>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 12 }}>
          <div style={factCard}>
            <div style={{ fontSize: 13, fontWeight: 800, color: TEC_COLORS.text }}>💠 {x.piPayments}</div>
            <div style={{ fontSize: 12, color: TEC_COLORS.subtext, marginTop: 5, lineHeight: 1.5 }}>
              {l.piAccepted ? x.piAcceptedYes : x.piAcceptedNo}
            </div>
          </div>
          <div style={factCard}>
            <div style={{ fontSize: 13, fontWeight: 800, color: TEC_COLORS.text }}>🛡️ {x.verification}</div>
            <div style={{ fontSize: 12, color: TEC_COLORS.subtext, marginTop: 5, lineHeight: 1.5 }}>
              {verified ? x.verifiedBody : x.unverifiedBody}
            </div>
          </div>
          <div style={factCard}>
            <div style={{ fontSize: 13, fontWeight: 800, color: TEC_COLORS.text }}>🤝 {x.trust}</div>
            <div style={{ fontSize: 12, color: TEC_COLORS.subtext, marginTop: 5, lineHeight: 1.5 }}>
              {l.trustHint}
            </div>
          </div>
        </div>

        {/* The person behind the listing, and one tap to follow them.
            This is the whole idea: nobody is told to "open Connection". The
            request goes to EXPLORER'S own BFF and the server calls the gateway
            — never a browser call across origins, which Pi Browser breaks. */}
        {owner && (
          <FollowOwner username={owner.username} headline={owner.headline} verified={owner.verified} />
        )}

        {/* What customers said. `l.owner` is passed so a merchant is not shown
            a form the API would refuse — the handle is used ONLY for that
            comparison, never rendered (C-107 §4: listing a shop is not consent
            to having your personal handle printed beside it). */}
        <Reviews handle={l.id} ownerUsername={l.owner} />

        {l.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
            {l.tags.map((t) => (
              <span key={t} style={{ fontSize: 11, color: TEC_COLORS.gold, border: `1px solid ${TEC_COLORS.gold}33`, borderRadius: 999, padding: '3px 10px' }}>#{t}</span>
            ))}
          </div>
        )}

        <p style={{ fontSize: 11, color: TEC_COLORS.subtext, margin: '22px 0 0', lineHeight: 1.5 }}>
          {x.disclaimer}
        </p>
      </div>
    </main>
  );
}

const linkStyle: React.CSSProperties = { color: TEC_COLORS.gold, textDecoration: 'none', fontWeight: 600 };

/** One labelled line of contact information. */
function Fact({ icon, label, children }: {
  icon: string; label: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span aria-hidden style={{ fontSize: 14, lineHeight: 1.5 }}>{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11, color: TEC_COLORS.subtext, marginBottom: 1 }}>{label}</div>
        <div style={{ fontSize: 13.5, color: TEC_COLORS.text, lineHeight: 1.5, wordBreak: 'break-word' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
