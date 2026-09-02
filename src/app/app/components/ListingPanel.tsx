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
import { useTranslation } from '@/lib/i18n';
import { buildHeaders } from '@/lib/request-id';
import { CATEGORIES, CATEGORY_META, type Category, type Listing } from '@/lib/explorer/directory';
import { PHOTO_MIME, PHOTO_MAX_BYTES } from '@/lib/explorer/photo-rules';
import { reportError } from '@/lib/observability/reportError';

type Draft = {
  name: string; category: Category; area: string; summary: string; tags: string;
  address: string; hours: string; phone: string; website: string;
  /** The shop's pin. Null when the merchant has not set one, or cleared it. */
  lat: number | null; lng: number | null;
};

const emptyDraft: Draft = {
  name: '', category: 'services', area: '', summary: '', tags: '',
  address: '', hours: '', phone: '', website: '', lat: null, lng: null,
};

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? 'https://hub.tecosystem.app';

const toDraft = (l: Listing): Draft => ({
  name: l.name, category: l.category, area: l.area, summary: l.summary, tags: l.tags.join(', '),
  // '' for a field the business has not filled in. The form always sends all
  // four, so '' consistently means "cleared" — the backend distinguishes that
  // from "not sent" and only the latter leaves a column untouched.
  address: l.address ?? '', hours: l.hours ?? '', phone: l.phone ?? '', website: l.website ?? '',
  lat: l.lat ?? null, lng: l.lng ?? null,
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
  const { t } = useTranslation();
  const x = t.explorer;
  const [listing, setListing] = useState<Listing | null>(null);
  const [loaded, setLoaded]   = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState<Draft>(emptyDraft);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Bumped after every change so the <img> refetches. Without it the browser
  // serves the cached copy and the merchant sees their OLD photo after a
  // successful upload — which reads as a failure.
  const [photoVersion, setPhotoVersion] = useState(0);

  /** Upload a shop photo. The bytes go to this app's own BFF (no CORS). */
  async function uploadPhoto(file: File) {
    setPhotoBusy(true); setPhotoError(null);
    try {
      const res = await fetch('/api/bff/explorer/photo', {
        method: 'POST',
        // The file IS the body, and its type IS the Content-Type. No FormData:
        // the server validates the real byte length rather than a number the
        // client claimed.
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setPhotoError(data.message ?? x.photoFailed); return; }
      setListing(data.listing as Listing);
      setPhotoVersion((v) => v + 1);
    } catch (err) {
      reportError(err, { where: 'ListingPanel.uploadPhoto' });
      setPhotoError(x.networkError);
    }
    finally { setPhotoBusy(false); }
  }

  async function removePhoto() {
    setPhotoBusy(true); setPhotoError(null);
    try {
      const res = await fetch('/api/bff/explorer/photo', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setPhotoError(data.error ?? x.photoRemoveFailed); return; }
      setListing(data.listing as Listing);
      setPhotoVersion((v) => v + 1);
    } catch (err) {
      reportError(err, { where: 'ListingPanel.removePhoto' });
      setPhotoError(x.networkError);
    }
    finally { setPhotoBusy(false); }
  }

  /**
   * Capture the shop's position from the device, once, on request.
   *
   * High accuracy IS asked for here, unlike the visitor-facing "near me": this
   * value is written down and shown to strangers as where to go, so a 300 m
   * error is a customer at the wrong corner. It is worth the wait for a
   * one-time action the merchant deliberately took.
   */
  function pickHere() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError(x.geoNoSupport);
      return;
    }
    setLocating(true); setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setDraft((d) => ({ ...d, lat: p.coords.latitude, lng: p.coords.longitude }));
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setGeoError(err.code === err.PERMISSION_DENIED
          ? x.geoBlocked
          : x.geoFailed);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  async function load() {
    try {
      const res = await fetch('/api/bff/explorer/listings', { cache: 'no-store' });
      if (!res.ok) { setLoaded(true); return; }
      const data = await res.json().catch(() => ({}));
      const own = (data.listings as Listing[])?.[0] ?? null;
      setListing(own);
    } catch (err) {
      // The panel still renders the create form — a merchant with no listing
      // and a merchant whose listing failed to load look the same to them, but
      // they must not look the same to us.
      reportError(err, { where: 'ListingPanel.load' });
    }
    finally { setLoaded(true); }
  }

  useEffect(() => { if (isAuth) load(); }, [isAuth]);

  // A tab that renders nothing is indistinguishable from a broken app, and this
  // one did exactly that. Every branch below says something.
  if (authLoading || (isAuth && !loaded)) {
    return (
      <section style={{ marginTop: 24 }}>
        <p style={{ fontSize: 13, color: TEC_COLORS.subtext }}>{x.loadingListing}</p>
      </section>
    );
  }

  // Signed out. This is the pitch, not an error: listing a business is the whole
  // reason a merchant opens Explorer, so tell them what it does and how to start.
  if (!isAuth) {
    return (
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: TEC_COLORS.text, margin: '0 0 4px' }}>
          {x.listPitchTitle}
        </h2>
        <p style={{ fontSize: 12.5, color: TEC_COLORS.subtext, margin: '0 0 12px', lineHeight: 1.55 }}>
          {x.listPitchBody}
        </p>
        <button
          onClick={() => ssoRedirect(HUB_URL, `${window.location.origin}/app`)}
          style={primaryBtn(false)}
        >{x.signIn}</button>
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
      address: draft.address, hours: draft.hours, phone: draft.phone, website: draft.website,
      lat: draft.lat, lng: draft.lng,
    };
    try {
      const res = await fetch(
        isEdit ? `/api/bff/explorer/business/${encodeURIComponent(listing!.id)}` : '/api/bff/explorer/listings',
        { method: isEdit ? 'PATCH' : 'POST', headers: buildHeaders(null), body: JSON.stringify(payload) },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 409 ? x.alreadyListed : (data.error ?? x.couldNotSave));
        return;
      }
      setListing(data.listing as Listing);
      setEditing(false);
    } catch (err) {
      reportError(err, { where: 'ListingPanel.save' });
      setError(x.networkError);
    }
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
        <h2 style={{ fontSize: 16, fontWeight: 800, color: TEC_COLORS.text, margin: '0 0 10px' }}>{x.yourListing}</h2>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: TEC_COLORS.text }}>
              {CATEGORY_META[listing.category].icon} {listing.name}
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, color: v ? TEC_COLORS.gold : TEC_COLORS.subtext, border: `1px solid ${(v ? TEC_COLORS.gold : TEC_COLORS.subtext)}55`, borderRadius: 999, padding: '2px 8px' }}>
              {v ? x.verifiedTag : x.unverifiedTag}
            </span>
          </div>
          <div style={{ fontSize: 11, color: TEC_COLORS.gold, marginTop: 3 }}>
            {CATEGORY_META[listing.category].label} · {listing.area} · {listing.piAccepted ? 'π accepted' : 'Pi soon'}
          </div>
          <div style={{ fontSize: 12, color: TEC_COLORS.subtext, marginTop: 5, lineHeight: 1.5 }}>{listing.summary}</div>
          {listing.featured ? (
            <div style={{ marginTop: 10, fontSize: 12, color: TEC_COLORS.gold, fontWeight: 700 }}>
              {x.featured}
            </div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 11.5, color: TEC_COLORS.subtext, lineHeight: 1.5 }}>
              {x.goProHint.split('{pro}')[0]}
              <strong style={{ color: TEC_COLORS.gold }}>Pro</strong>
              {x.goProHint.split('{pro}')[1]}
            </div>
          )}
          {/* The shop photo. On the summary card rather than in the edit form
              because it uploads immediately — it is not part of the draft that
              Save writes, and putting it in the form would imply otherwise. */}
          <div style={{ marginTop: 12 }}>
            {listing.hasPhoto && (
                  <img
                src={`/api/photo/${encodeURIComponent(listing.id)}?v=${photoVersion}`}
                alt=""
                style={{
                  width: '100%', height: 140, objectFit: 'cover', borderRadius: 8,
                  display: 'block', marginBottom: 8,
                }}
              />
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ ...ghostBtn, display: 'inline-block' }}>
                {photoBusy ? x.photoWorking : listing.hasPhoto ? x.changePhoto : x.addPhoto}
                <input
                  type="file"
                  accept={PHOTO_MIME.join(',')}
                  disabled={photoBusy}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    // Cleared so choosing the SAME file again still fires a
                    // change event — otherwise a retry after a failure silently
                    // does nothing.
                    e.target.value = '';
                    if (f) void uploadPhoto(f);
                  }}
                />
              </label>
              {listing.hasPhoto && (
                <button
                  type="button" onClick={() => void removePhoto()} disabled={photoBusy}
                  style={{ ...ghostBtn, color: TEC_COLORS.subtext, borderColor: `${TEC_COLORS.subtext}44` }}
                >{x.removePhoto}</button>
              )}
            </div>
            {photoError && <div style={{ marginTop: 6, fontSize: 11.5, color: '#EF4444' }}>{photoError}</div>}
            {!listing.hasPhoto && !photoError && (
              <div style={{ marginTop: 6, fontSize: 11, color: TEC_COLORS.subtext, lineHeight: 1.5 }}>
                {x.photoHint.replace('{mb}', String(Math.round(PHOTO_MAX_BYTES / 1024 / 1024)))}
              </div>
            )}
          </div>

          {/* What a customer can actually do with this listing. Shown as the
              merchant's own checklist, because "you can be found but not
              reached" is invisible from their side otherwise — the listing
              looks complete to the person who wrote it. */}
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([
              [x.checklistAddress, listing.address],
              [x.checklistHours,   listing.hours],
              [x.checklistPhone,   listing.phone],
              [x.checklistWebsite, listing.website],
              [x.checklistPin,     listing.lat !== undefined && listing.lng !== undefined ? 'set' : undefined],
              [x.checklistPhoto,   listing.hasPhoto ? 'set' : undefined],
            ] as const).map(([label, value]) => (
              <span
                key={label}
                style={{
                  fontSize: 10.5, borderRadius: 999, padding: '2px 8px',
                  color: value ? TEC_COLORS.gold : TEC_COLORS.subtext,
                  border: `1px solid ${value ? `${TEC_COLORS.gold}55` : `${TEC_COLORS.subtext}44`}`,
                  opacity: value ? 1 : 0.7,
                }}
              >{value ? `✓ ${label}` : `+ ${label}`}</span>
            ))}
          </div>
          {listing.lat === undefined && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: TEC_COLORS.subtext, lineHeight: 1.5 }}>
              {x.notOnMapWarn}
            </div>
          )}
          {!listing.address && !listing.phone && !listing.website && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: TEC_COLORS.subtext, lineHeight: 1.5 }}>
              {x.reachableWarn}
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => { setDraft(toDraft(listing)); setEditing(true); setError(null); }} style={ghostBtn}>{x.editListing}</button>
            {!v && <span style={{ fontSize: 11, color: TEC_COLORS.subtext }}>{x.kycNote}</span>}
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
        {isEdit ? x.editTitle : x.createTitle}
      </h2>
      <p style={{ fontSize: 12, color: TEC_COLORS.subtext, margin: '0 0 12px', lineHeight: 1.5 }}>
        {x.createHint.split('{unverified}')[0]}
        <strong style={{ color: TEC_COLORS.text }}>{x.unverifiedTag}</strong>
        {x.createHint.split('{unverified}')[1]}
      </p>
      <form onSubmit={save} style={{ ...card, display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11.5, color: TEC_COLORS.subtext }}>{x.fieldName}</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required minLength={2} maxLength={80} placeholder="e.g. Pi Corner Café" style={input} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11.5, color: TEC_COLORS.subtext }}>{x.fieldCategory}</span>
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })} style={input}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_META[c].icon} {CATEGORY_META[c].label}</option>)}
            </select>
          </label>
        </div>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: TEC_COLORS.subtext }}>{x.fieldArea} <span style={{ opacity: 0.6 }}>{x.fieldAreaHint}</span></span>
          <input value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })} required minLength={2} maxLength={60} placeholder="e.g. City Center / Remote" style={input} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: TEC_COLORS.subtext }}>{x.fieldSummary}</span>
          <input value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} required minLength={2} maxLength={160} placeholder="What you offer, paid in Pi." style={input} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: TEC_COLORS.subtext }}>{x.fieldTags} <span style={{ opacity: 0.6 }}>{x.fieldTagsHint}</span></span>
          <input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} maxLength={120} placeholder="coffee, wifi, brunch" style={input} />
        </label>

        {/* How customers reach you. Optional, but this is the half that turns a
            name in a list into a visit — a listing without it can be found and
            not acted on. Unlike `Area` above, these are yours to publish. */}
        <div style={{ borderTop: `1px solid ${TEC_COLORS.gold}22`, paddingTop: 10, marginTop: 2 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: TEC_COLORS.text }}>{x.reachTitle}</div>
          <div style={{ fontSize: 11, color: TEC_COLORS.subtext, marginTop: 2, lineHeight: 1.5 }}>
            {x.reachHint}
          </div>
        </div>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: TEC_COLORS.subtext }}>{x.fieldAddress} <span style={{ opacity: 0.6 }}>{x.fieldAddressHint}</span></span>
          <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} maxLength={160} placeholder="12 Nile St, Maadi" style={input} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11.5, color: TEC_COLORS.subtext }}>{x.fieldHours}</span>
            <input value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} maxLength={120} placeholder="Sat–Thu 9am–11pm" style={input} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11.5, color: TEC_COLORS.subtext }}>{x.fieldPhone}</span>
            <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} type="tel" maxLength={32} placeholder="+20 100 123 4567" style={input} dir="ltr" />
          </label>
        </div>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: TEC_COLORS.subtext }}>{x.fieldWebsite}</span>
          <input value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} maxLength={200} placeholder="yourshop.com" style={input} dir="ltr" />
        </label>

        {/* The pin. Captured by standing in the shop and tapping, rather than
            typed: nobody knows their own coordinates, and asking a merchant to
            find them is asking them to skip this field. Typing them is still
            possible for anyone who has them.

            This is the merchant's OWN location, published about their OWN
            premises — the opposite party from the searcher whose location
            C-108 §6 says is never stored. */}
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 11.5, color: TEC_COLORS.subtext }}>
            {x.fieldMapPin} <span style={{ opacity: 0.6 }}>{x.fieldMapPinHint}</span>
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={pickHere} disabled={locating} style={ghostBtn}>
              {locating ? x.locating : draft.lat !== null ? x.updatePin : x.useMyLocation}
            </button>
            {draft.lat !== null && draft.lng !== null && (
              <>
                <span style={{ fontSize: 11.5, color: TEC_COLORS.gold }} dir="ltr">
                  {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
                </span>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, lat: null, lng: null })}
                  style={{ ...ghostBtn, color: TEC_COLORS.subtext, borderColor: `${TEC_COLORS.subtext}44` }}
                >{x.removePin}</button>
              </>
            )}
          </div>
          {geoError && <div style={{ fontSize: 11.5, color: TEC_COLORS.subtext }}>{geoError}</div>}
          <div style={{ fontSize: 11, color: TEC_COLORS.subtext, lineHeight: 1.5 }}>
            {x.pinHint}
          </div>
        </div>
        {error && <div style={{ color: '#EF4444', fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={busy || draft.name.trim().length < 2} style={primaryBtn(busy || draft.name.trim().length < 2)}>
            {busy ? x.saving : isEdit ? x.saveChanges : x.createListing}
          </button>
          {isEdit && <button type="button" onClick={() => { setEditing(false); setError(null); }} style={ghostBtn}>{x.cancel}</button>}
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
