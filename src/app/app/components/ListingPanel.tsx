'use client';

// TEC Explorer — self-listing surface (C-108). A business owner lists their business
// into the discovery index and edits it. Explorer OWNS the listing index; it never
// self-mints verification — a new listing is UNVERIFIED until tec-kyc-service verifies
// it (presented, never minted). Identity is the session (the BFF forwards the JWT;
// owner is derived from the token server-side, never a client field — P6). Ranking
// (popularity / trend) is Analytics' job, applied at discovery time — not here.
import { useEffect, useState } from 'react';
import { TEC_COLORS } from '@yasser172/tec-ui';
import { ssoRedirect } from '@yasser172/tec-auth';
import { buildHeaders } from '@/lib/request-id';
import { CATEGORIES, CATEGORY_META, type Category, type Listing } from '@/lib/explorer/directory';

type Draft = { name: string; category: Category; area: string; summary: string; tags: string };

const emptyDraft: Draft = { name: '', category: 'services', area: '', summary: '', tags: '' };

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? 'https://hub.tecosystem.app';

const toDraft = (l: Listing): Draft => ({
  name: l.name, category: l.category, area: l.area, summary: l.summary, tags: l.tags.join(', '),
});
const tagsArray = (s: string) => s.split(',').map((t) => t.trim()).filter(Boolean);

export function ListingPanel({ isAuth, authLoading = false }: {
  isAuth: boolean;
  /**
   * Whether the session is still being resolved server-side. Without this the
   * signed-out pitch flashes for everyone on every open, because the answer to
   * "am I signed in?" arrives over the network (C-123 §3).
   */
  authLoading?: boolean;
}) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [loaded, setLoaded]   = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState<Draft>(emptyDraft);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/bff/explorer/listings', { cache: 'no-store' });
      if (!res.ok) { setLoaded(true); return; }
      const data = await res.json().catch(() => ({}));
      const own = (data.listings as Listing[])?.[0] ?? null;
      setListing(own);
    } catch { /* keep empty */ }
    finally { setLoaded(true); }
  }

  useEffect(() => { if (isAuth) load(); }, [isAuth]);

  // A tab that renders nothing is indistinguishable from a broken app, and this
  // one did exactly that. Every branch below says something.
  if (authLoading || (isAuth && !loaded)) {
    return (
      <section style={{ marginTop: 24 }}>
        <p style={{ fontSize: 13, color: TEC_COLORS.subtext }}>Loading your listing…</p>
      </section>
    );
  }

  // Signed out. This is the pitch, not an error: listing a business is the whole
  // reason a merchant opens Explorer, so tell them what it does and how to start.
  if (!isAuth) {
    return (
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: TEC_COLORS.text, margin: '0 0 4px' }}>
          List your business
        </h2>
        <p style={{ fontSize: 12.5, color: TEC_COLORS.subtext, margin: '0 0 12px', lineHeight: 1.55 }}>
          Put your Pi-accepting business on the discovery map so people searching for
          somewhere to spend Pi can find you. Sign in with Pi to create your listing —
          it is tied to your Pi account, so only you can edit it.
        </p>
        <button
          onClick={() => ssoRedirect(HUB_URL, `${window.location.origin}/app`)}
          style={primaryBtn(false)}
        >Sign in with Pi</button>
      </section>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    const isEdit = listing !== null;
    const payload = {
      name: draft.name, category: draft.category, area: draft.area,
      summary: draft.summary, tags: tagsArray(draft.tags),
    };
    try {
      const res = await fetch(
        isEdit ? `/api/bff/explorer/business/${encodeURIComponent(listing!.id)}` : '/api/bff/explorer/listings',
        { method: isEdit ? 'PATCH' : 'POST', headers: buildHeaders(null), body: JSON.stringify(payload) },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 409 ? 'You already have a listing.' : (data.error ?? 'Could not save.'));
        return;
      }
      setListing(data.listing as Listing);
      setEditing(false);
    } catch { setError('Network error — please try again.'); }
    finally { setBusy(false); }
  }

  const card: React.CSSProperties = {
    background: TEC_COLORS.surface, border: `1px solid ${TEC_COLORS.gold}22`, borderRadius: 12, padding: 14,
  };
  const input: React.CSSProperties = {
    width: '100%', padding: '9px 11px', background: TEC_COLORS.bg, color: TEC_COLORS.text,
    border: `1px solid ${TEC_COLORS.gold}22`, borderRadius: 8, fontSize: 13, outline: 'none',
  };

  // ── The listing exists and we are not editing → summary card ──
  if (listing && !editing) {
    const v = listing.verification === 'verified';
    return (
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: TEC_COLORS.text, margin: '0 0 10px' }}>Your listing</h2>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: TEC_COLORS.text }}>
              {CATEGORY_META[listing.category].icon} {listing.name}
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, color: v ? TEC_COLORS.gold : TEC_COLORS.subtext, border: `1px solid ${(v ? TEC_COLORS.gold : TEC_COLORS.subtext)}55`, borderRadius: 999, padding: '2px 8px' }}>
              {v ? '✅ Verified' : 'Unverified'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: TEC_COLORS.gold, marginTop: 3 }}>
            {CATEGORY_META[listing.category].label} · {listing.area} · {listing.piAccepted ? 'π accepted' : 'Pi soon'}
          </div>
          <div style={{ fontSize: 12, color: TEC_COLORS.subtext, marginTop: 5, lineHeight: 1.5 }}>{listing.summary}</div>
          {listing.featured ? (
            <div style={{ marginTop: 10, fontSize: 12, color: TEC_COLORS.gold, fontWeight: 700 }}>
              ⭐ Featured — your listing ranks higher in discovery (Explorer Pro).
            </div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 11.5, color: TEC_COLORS.subtext, lineHeight: 1.5 }}>
              Go <strong style={{ color: TEC_COLORS.gold }}>Pro</strong> to feature your listing — rank higher so more Pi users find you.
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => { setDraft(toDraft(listing)); setEditing(true); setError(null); }} style={ghostBtn}>Edit listing</button>
            {!v && <span style={{ fontSize: 11, color: TEC_COLORS.subtext }}>Verification is issued by KYC — Explorer never self-verifies.</span>}
          </div>
        </div>
      </section>
    );
  }

  // ── No listing (create) OR editing → form ──
  const isEdit = listing !== null;
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: TEC_COLORS.text, margin: '0 0 4px' }}>
        {isEdit ? 'Edit your listing' : 'List your business'}
      </h2>
      <p style={{ fontSize: 12, color: TEC_COLORS.subtext, margin: '0 0 12px', lineHeight: 1.5 }}>
        Put your Pi-accepting business on the discovery map. New listings start
        <strong style={{ color: TEC_COLORS.text }}> Unverified</strong> — verification is issued by KYC.
      </p>
      <form onSubmit={save} style={{ ...card, display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11.5, color: TEC_COLORS.subtext }}>Name</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required minLength={2} maxLength={80} placeholder="e.g. Pi Corner Café" style={input} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11.5, color: TEC_COLORS.subtext }}>Category</span>
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })} style={input}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_META[c].icon} {CATEGORY_META[c].label}</option>)}
            </select>
          </label>
        </div>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: TEC_COLORS.subtext }}>Area <span style={{ opacity: 0.6 }}>(a general area — never your exact address)</span></span>
          <input value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })} required minLength={2} maxLength={60} placeholder="e.g. City Center / Remote" style={input} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: TEC_COLORS.subtext }}>Summary</span>
          <input value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} required minLength={2} maxLength={160} placeholder="What you offer, paid in Pi." style={input} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: TEC_COLORS.subtext }}>Tags <span style={{ opacity: 0.6 }}>(comma-separated, optional)</span></span>
          <input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} maxLength={120} placeholder="coffee, wifi, brunch" style={input} />
        </label>
        {error && <div style={{ color: '#EF4444', fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={busy || draft.name.trim().length < 2} style={primaryBtn(busy || draft.name.trim().length < 2)}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'List my business'}
          </button>
          {isEdit && <button type="button" onClick={() => { setEditing(false); setError(null); }} style={ghostBtn}>Cancel</button>}
        </div>
      </form>
    </section>
  );
}

const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '10px 16px', borderRadius: 8, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
  background: disabled ? `${TEC_COLORS.gold}33` : `linear-gradient(135deg, ${TEC_COLORS.gold}, ${TEC_COLORS.goldDark})`,
  color: disabled ? TEC_COLORS.subtext : '#0a0800', fontWeight: 800, fontSize: 13, flex: 1,
});

const ghostBtn: React.CSSProperties = {
  padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
  background: 'transparent', color: TEC_COLORS.gold, border: `1px solid ${TEC_COLORS.gold}44`,
  fontWeight: 700, fontSize: 12.5,
};
