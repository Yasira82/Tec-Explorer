'use client';

// TEC Explorer — self-listing surface (C-108). A business owner lists their business
// into the discovery index and edits it. Explorer OWNS the listing index; it never
// self-mints verification — a new listing is UNVERIFIED until tec-kyc-service verifies
// it (presented, never minted). Identity is the session (the BFF forwards the JWT;
// owner is derived from the token server-side, never a client field — P6). Ranking
// (popularity / trend) is Analytics' job, applied at discovery time — not here.
import { useEffect, useState } from 'react';
import { ssoRedirect } from '@yasser172/tec-auth';
import { useTranslation } from '@/lib/i18n';
import { buildHeaders } from '@/lib/request-id';
import { CATEGORIES, CATEGORY_META, type Category, type Listing } from '@/lib/explorer/directory';
import { trustLevel, TRUST_TAG } from '@/lib/explorer/trust';
import { PHOTO_MIME, PHOTO_MAX_BYTES } from '@/lib/explorer/photo-rules';
import { reportError } from '@/lib/observability/reportError';
import { C, goldA, inkA, errorA } from '@/lib-client/palette';
import { parseCoords, formatCoords } from '@/lib-client/coords';
import { PinPickerCard } from '@/components/map/PinPickerCard';

/**
 * Mirrors MAX_LISTINGS_PER_OWNER in tec-identity-service.
 *
 * Duplicated rather than fetched: it is used only to decide whether to SHOW an
 * "add another" button. The backend is still the authority — it returns 409
 * either way — so the worst a drift can do is offer a button that is then
 * refused with a clear message, which is better than an extra round trip on
 * every open.
 */
const MAX_LISTINGS = 5;

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
  // ALL of them, not the first one. The cap is five now, and a panel that
  // renders `listings[0]` does not show a merchant fewer businesses — it shows
  // them a missing business, with no way to tell that the others exist.
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded]   = useState(false);
  const [editing, setEditing] = useState(false);
  /**
   * Adding a business while already having one.
   *
   * Separate from `editing` because they are opposite intents that reach the
   * same form: with a listing selected, `editing` means PATCH that listing and
   * `creating` means POST a new one. Collapsing them into "the form is open"
   * is how an add-another button silently overwrites the business the merchant
   * was looking at.
   */
  const [creating, setCreating] = useState(false);
  const [draft, setDraft]     = useState<Draft>(emptyDraft);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  /**
   * The map picker, and the coordinate box beside it.
   *
   * `coordText` is held SEPARATELY from the draft rather than derived from it:
   * a paste is half-invalid while it is being typed, and rendering the field
   * from `draft.lat` would fight the person editing it on every keystroke.
   */
  const [picking, setPicking] = useState(false);
  const [coordText, setCoordText] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Bumped after every change so the <img> refetches. Without it the browser
  // serves the cached copy and the merchant sees their OLD photo after a
  // successful upload — which reads as a failure.
  const [photoVersion, setPhotoVersion] = useState(0);
  /**
   * The take-down flow.
   *
   * `confirming` opens it; `typed` is what the merchant wrote into the confirm
   * box. A typed word rather than a second tap: this is irreversible, it sits on
   * the same card as Edit and Add photo, and on a phone a confirm dialog is
   * dismissed by the same thumb motion that opened it. Typing is the one gesture
   * that cannot be made by accident.
   */
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removedName, setRemovedName] = useState<string | null>(null);

  /** Take the selected listing down. */
  async function removeListing(target: Listing) {
    if (busy) return;
    setBusy(true); setRemoveError(null);
    try {
      const res = await fetch(`/api/bff/explorer/business/${encodeURIComponent(target.id)}`, {
        method: 'DELETE', headers: buildHeaders(null),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRemoveError(data.error ?? x.removeFailed);
        return;
      }
      // Dropped from local state rather than refetched: the merchant is looking
      // at the card right now, and a round trip would leave the business they
      // just removed on screen for as long as the network takes.
      setListings((prev) => {
        const next = prev.filter((l) => l.id !== target.id);
        setSelectedId(next[0]?.id ?? null);
        return next;
      });
      setConfirming(false); setTyped(''); setEditing(false);
      setRemovedName(target.name);
    } catch (err) {
      reportError(err, { where: 'ListingPanel.removeListing' });
      setRemoveError(x.networkError);
    }
    finally { setBusy(false); }
  }

  /** Upload a shop photo. The bytes go to this app's own BFF (no CORS). */
  async function uploadPhoto(file: File) {
    setPhotoBusy(true); setPhotoError(null);
    try {
      const res = await fetch(`/api/bff/explorer/photo?handle=${encodeURIComponent(listing?.id ?? '')}`, {
        method: 'POST',
        // The file IS the body, and its type IS the Content-Type. No FormData:
        // the server validates the real byte length rather than a number the
        // client claimed.
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setPhotoError(data.message ?? x.photoFailed); return; }
      replace(data.listing as Listing);
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
      const res = await fetch(
        `/api/bff/explorer/photo?handle=${encodeURIComponent(listing?.id ?? '')}`,
        { method: 'DELETE' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setPhotoError(data.error ?? x.photoRemoveFailed); return; }
      replace(data.listing as Listing);
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
        // Open the map straight away. The merchant asked to set a pin; being
        // told "no" and left staring at the same button is how a field gets
        // skipped, and a listing that is not on the map is the whole loss.
        setPicking(true);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  async function load() {
    try {
      const res = await fetch('/api/bff/explorer/listings', { cache: 'no-store' });
      if (!res.ok) { setLoaded(true); return; }
      const data = await res.json().catch(() => ({}));
      const own = (data.listings as Listing[]) ?? [];
      setListings(own);
      // Keep the current selection across a reload; fall back to the first.
      setSelectedId((prev) => (prev && own.some((l) => l.id === prev) ? prev : own[0]?.id ?? null));
    } catch (err) {
      // The panel still renders the create form — a merchant with no listing
      // and a merchant whose listing failed to load look the same to them, but
      // they must not look the same to us.
      reportError(err, { where: 'ListingPanel.load' });
    }
    finally { setLoaded(true); }
  }

  useEffect(() => { if (isAuth) load(); }, [isAuth]);

  /** The business currently being viewed or edited. */
  const listing = listings.find((l) => l.id === selectedId) ?? null;
  const atCap = listings.length >= MAX_LISTINGS;

  /** Replace one listing in place after a write, without reordering the rest. */
  const replace = (next: Listing) => {
    setListings((prev) => {
      const i = prev.findIndex((l) => l.id === next.id);
      if (i === -1) return [...prev, next];
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
    setSelectedId(next.id);
  };

  // A tab that renders nothing is indistinguishable from a broken app, and this
  // one did exactly that. Every branch below says something.
  if (authLoading || (isAuth && !loaded)) {
    return (
      <section style={{ marginTop: 24 }}>
        <p style={{ fontSize: 13, color: C.subtext }}>{x.loadingListing}</p>
      </section>
    );
  }

  // Signed out. This is the pitch, not an error: listing a business is the whole
  // reason a merchant opens Explorer, so tell them what it does and how to start.
  if (!isAuth) {
    return (
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: '0 0 4px' }}>
          {x.listPitchTitle}
        </h2>
        <p style={{ fontSize: 12.5, color: C.subtext, margin: '0 0 12px', lineHeight: 1.55 }}>
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
    // Editing the selected business, or adding a new one — `editing` is only
    // true when a listing was opened for edit, so a null selection here means
    // "create".
    const isEdit = listing !== null && editing;
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
        setError(res.status === 409
          ? x.atListingCap.replace('{max}', String(MAX_LISTINGS))
          : (data.error ?? x.couldNotSave));
        return;
      }
      replace(data.listing as Listing);
      setEditing(false);
      setCreating(false);
    } catch (err) {
      reportError(err, { where: 'ListingPanel.save' });
      setError(x.networkError);
    }
    finally { setBusy(false); }
  }

  const card: React.CSSProperties = {
    background: C.surface, border: `1px solid ${goldA(0.133)}`, borderRadius: 12, padding: 14,
  };
  const input: React.CSSProperties = {
    width: '100%', padding: '9px 11px', background: C.bg, color: C.text,
    border: `1px solid ${goldA(0.133)}`, borderRadius: 8, fontSize: 13, outline: 'none',
  };

  /**
   * Confirmation that the removal happened.
   *
   * Needed because success looks like absence: the card the merchant was
   * reading simply stops being there, and on the last listing the create form
   * appears instead — which reads as the app losing their business rather than
   * doing what they asked.
   */
  const removedBanner = removedName ? (
    <div style={{
      marginBottom: 12, padding: '9px 11px', borderRadius: 8, fontSize: 12,
      color: C.subtext, border: `1px solid ${inkA(0.2)}`,
    }}>
      {x.removedOk} <strong style={{ color: C.text }}>{removedName}</strong>
    </div>
  ) : null;

  /**
   * Switch between the merchant's businesses.
   *
   * Rendered only past the first one: a single-business merchant — which is
   * almost all of them — should not have to read a control that offers them one
   * choice. The selected chip is filled rather than merely outlined, because on
   * a phone the previous listing is scrolled off screen and the only clue about
   * WHICH business the card below describes is up here.
   */
  const switcher = listings.length > 1 ? (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: C.subtext, marginBottom: 6 }}>{x.switchListing}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {listings.map((l) => {
          const on = l.id === selectedId;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                setSelectedId(l.id); setEditing(false); setError(null); setPhotoError(null);
                // Never carry a half-typed confirmation onto a DIFFERENT business.
                setConfirming(false); setTyped(''); setRemoveError(null);
              }}
              style={{
                padding: '5px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: on ? `${goldA(0.133)}` : 'transparent',
                color: on ? C.gold : C.subtext,
                border: `1px solid ${on ? `${goldA(0.4)}` : `${inkA(0.267)}`}`,
              }}
            >{CATEGORY_META[l.category].icon} {l.name}</button>
          );
        })}
      </div>
    </div>
  ) : null;

  // ── A listing exists and we are neither editing it nor adding another → summary card ──
  if (listing && !editing && !creating) {
    const v = listing.verification === 'verified';
    const level = trustLevel(listing);
    return (
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: '0 0 10px' }}>
          {listings.length > 1 ? x.yourListings : x.yourListing}
        </h2>
        {removedBanner}
        {switcher}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
              {CATEGORY_META[listing.category].icon} {listing.name}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 800,
              color: level === 1 ? C.subtext : C.gold,
              border: `1px solid ${level === 1 ? inkA(0.33) : goldA(0.33)}`,
              borderRadius: 999, padding: '2px 8px',
            }}>
              {x[TRUST_TAG[level]]}
            </span>
          </div>
          <div style={{ fontSize: 11, color: C.gold, marginTop: 3 }}>
            {CATEGORY_META[listing.category].label} · {listing.area} · {listing.piAccepted ? 'π accepted' : 'Pi soon'}
          </div>
          <div style={{ fontSize: 12, color: C.subtext, marginTop: 5, lineHeight: 1.5 }}>{listing.summary}</div>
          {listing.featured ? (
            <div style={{ marginTop: 10, fontSize: 12, color: C.gold, fontWeight: 700 }}>
              {x.featured}
            </div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 11.5, color: C.subtext, lineHeight: 1.5 }}>
              {x.goProHint.split('{pro}')[0]}
              <strong style={{ color: C.gold }}>Pro</strong>
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
                  style={{ ...ghostBtn, color: C.subtext, borderColor: `${inkA(0.267)}` }}
                >{x.removePhoto}</button>
              )}
            </div>
            {photoError && <div style={{ marginTop: 6, fontSize: 11.5, color: C.error }}>{photoError}</div>}
            {!listing.hasPhoto && !photoError && (
              <div style={{ marginTop: 6, fontSize: 11, color: C.subtext, lineHeight: 1.5 }}>
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
                  color: value ? C.gold : C.subtext,
                  border: `1px solid ${value ? `${goldA(0.333)}` : `${inkA(0.267)}`}`,
                  opacity: value ? 1 : 0.7,
                }}
              >{value ? `✓ ${label}` : `+ ${label}`}</span>
            ))}
          </div>
          {listing.lat === undefined && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: C.subtext, lineHeight: 1.5 }}>
              {x.notOnMapWarn}
            </div>
          )}
          {!listing.address && !listing.phone && !listing.website && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: C.subtext, lineHeight: 1.5 }}>
              {x.reachableWarn}
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => { setDraft(toDraft(listing)); setEditing(true); setError(null); }} style={ghostBtn}>{x.editListing}</button>
            {!v && <span style={{ fontSize: 11, color: C.subtext }}>{x.kycNote}</span>}
          </div>

          {/* Taking the listing down. Placed last and styled as plain text, not
              a button: a merchant opens this card to edit or add a photo, and
              the destructive action should be the hardest thing on it to hit by
              accident — not a red button sitting next to Edit. */}
          <div style={{ marginTop: 14, borderTop: `1px solid ${inkA(0.133)}`, paddingTop: 10 }}>
            {!confirming ? (
              <button
                type="button"
                onClick={() => { setConfirming(true); setTyped(''); setRemoveError(null); }}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontSize: 11.5, color: C.subtext, textDecoration: 'underline',
                }}
              >{x.removeListing}</button>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: C.error }}>
                  {x.removeConfirmT.replace('{name}', listing.name)}
                </div>
                {/* Says what actually happens, including the part the merchant
                    cannot see: other people's reviews survive but become
                    unreachable. Hiding that would make this feel smaller than
                    it is. */}
                <div style={{ fontSize: 11.5, color: C.subtext, lineHeight: 1.55 }}>
                  {x.removeConfirmB}
                </div>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 11, color: C.subtext }}>
                    {x.removeTypeHint.replace('{word}', x.removeWord)}
                  </span>
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    // The confirm word stays in the Latin alphabet in every
                    // language (see removeWord), so the field is LTR even on an
                    // Arabic or Urdu page — a right-aligned box asking for
                    // "REMOVE" fights the person typing it.
                    dir="ltr"
                    autoComplete="off"
                    style={{ ...input, borderColor: '#EF444455' }}
                  />
                </label>
                {removeError && <div style={{ fontSize: 11.5, color: C.error }}>{removeError}</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={busy || typed.trim().toUpperCase() !== x.removeWord}
                    onClick={() => void removeListing(listing)}
                    style={{
                      padding: '9px 14px', borderRadius: 8, fontWeight: 800, fontSize: 12.5,
                      border: '1px solid #EF444466',
                      cursor: typed.trim().toUpperCase() === x.removeWord && !busy ? 'pointer' : 'not-allowed',
                      background: 'transparent',
                      color: typed.trim().toUpperCase() === x.removeWord ? C.error : C.subtext,
                      opacity: typed.trim().toUpperCase() === x.removeWord ? 1 : 0.6,
                    }}
                  >{busy ? x.removing : x.removeConfirm}</button>
                  <button
                    type="button"
                    onClick={() => { setConfirming(false); setTyped(''); setRemoveError(null); }}
                    style={ghostBtn}
                  >{x.cancel}</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* A second branch, a second project, a stall and a workshop. Offered
            only below the cap — a button that always fails is worse than no
            button — and the cap itself is stated rather than left to be
            discovered by pressing. */}
        <div style={{ marginTop: 12 }}>
          {atCap ? (
            <span style={{ fontSize: 11.5, color: C.subtext }}>
              {x.atListingCap.replace('{max}', String(MAX_LISTINGS))}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => { setDraft(emptyDraft); setCreating(true); setEditing(false); setError(null); }}
              style={ghostBtn}
            >{x.addAnother}</button>
          )}
        </div>
      </section>
    );
  }

  // ── No listing (create) OR editing OR adding another → form ──
  // Mirrors `save()` exactly: with a listing selected it is an edit only when
  // `editing` is what opened the form. If these two ever disagree, the form
  // says "Save changes" and then POSTs a duplicate.
  const isEdit = listing !== null && editing;
  return (
    <section style={{ marginTop: 24 }}>
      {removedBanner}
      <h2 style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: '0 0 4px' }}>
        {isEdit ? x.editTitle : x.createTitle}
      </h2>
      <p style={{ fontSize: 12, color: C.subtext, margin: '0 0 12px', lineHeight: 1.5 }}>
        {x.createHint.split('{unverified}')[0]}
        <strong style={{ color: C.gold }}>{x.trustL2}</strong>
        {x.createHint.split('{unverified}')[1]}
      </p>
      <form onSubmit={save} style={{ ...card, display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11.5, color: C.subtext }}>{x.fieldName}</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required minLength={2} maxLength={80} placeholder="e.g. Pi Corner Café" style={input} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11.5, color: C.subtext }}>{x.fieldCategory}</span>
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })} style={input}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_META[c].icon} {CATEGORY_META[c].label}</option>)}
            </select>
          </label>
        </div>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: C.subtext }}>{x.fieldArea} <span style={{ opacity: 0.6 }}>{x.fieldAreaHint}</span></span>
          <input value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })} required minLength={2} maxLength={60} placeholder="e.g. City Center / Remote" style={input} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: C.subtext }}>{x.fieldSummary}</span>
          <input value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} required minLength={2} maxLength={160} placeholder="What you offer, paid in Pi." style={input} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: C.subtext }}>{x.fieldTags} <span style={{ opacity: 0.6 }}>{x.fieldTagsHint}</span></span>
          <input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} maxLength={120} placeholder="coffee, wifi, brunch" style={input} />
        </label>

        {/* How customers reach you. Optional, but this is the half that turns a
            name in a list into a visit — a listing without it can be found and
            not acted on. Unlike `Area` above, these are yours to publish. */}
        <div style={{ borderTop: `1px solid ${goldA(0.133)}`, paddingTop: 10, marginTop: 2 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.text }}>{x.reachTitle}</div>
          <div style={{ fontSize: 11, color: C.subtext, marginTop: 2, lineHeight: 1.5 }}>
            {x.reachHint}
          </div>
        </div>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: C.subtext }}>{x.fieldAddress} <span style={{ opacity: 0.6 }}>{x.fieldAddressHint}</span></span>
          <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} maxLength={160} placeholder="12 Nile St, Maadi" style={input} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11.5, color: C.subtext }}>{x.fieldHours}</span>
            <input value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} maxLength={120} placeholder="Sat–Thu 9am–11pm" style={input} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11.5, color: C.subtext }}>{x.fieldPhone}</span>
            <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} type="tel" maxLength={32} placeholder="+20 100 123 4567" style={input} dir="ltr" />
          </label>
        </div>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: C.subtext }}>{x.fieldWebsite}</span>
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
          <span style={{ fontSize: 11.5, color: C.subtext }}>
            {x.fieldMapPin} <span style={{ opacity: 0.6 }}>{x.fieldMapPinHint}</span>
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={pickHere} disabled={locating} style={ghostBtn}>
              {locating ? x.locating : draft.lat !== null ? x.updatePin : x.useMyLocation}
            </button>
            {/* The second way in, and it is not a fallback bolted on after the
                first failed — it is offered up front, always. Geolocation is
                refused by whole browsers (Pi Browser is a webview whose HOST
                app decides, not the page), and a field with one way to fill it
                is a field that becomes impossible rather than inconvenient. */}
            <button
              type="button"
              onClick={() => setPicking((p) => !p)}
              style={{ ...ghostBtn, ...(picking ? { background: goldA(0.12) } : {}) }}
            >{x.pickOnMap}</button>
            {draft.lat !== null && draft.lng !== null && (
              <>
                <span style={{ fontSize: 11.5, color: C.gold }} dir="ltr">
                  {formatCoords({ lat: draft.lat, lng: draft.lng })}
                </span>
                <button
                  type="button"
                  onClick={() => { setDraft({ ...draft, lat: null, lng: null }); setCoordText(''); }}
                  style={{ ...ghostBtn, color: C.subtext, borderColor: `${inkA(0.267)}` }}
                >{x.removePin}</button>
              </>
            )}
          </div>

          {/* A refusal is not the end of the road any more, so it says what to
              do next instead of only what went wrong. */}
          {geoError && (
            <div style={{ fontSize: 11.5, color: C.subtext, lineHeight: 1.5 }}>
              {geoError} <strong style={{ color: C.gold }}>{x.geoUseMapInstead}</strong>
            </div>
          )}

          {picking && (
            <div style={{ display: 'grid', gap: 6 }}>
              <PinPickerCard
                value={draft.lat !== null && draft.lng !== null ? { lat: draft.lat, lng: draft.lng } : null}
                onChange={(p) => setDraft((d) => ({ ...d, lat: p.lat, lng: p.lng }))}
                label={draft.name || x.fieldMapPin}
              />
              <div style={{ fontSize: 11, color: C.subtext, lineHeight: 1.5 }}>{x.pickOnMapHint}</div>

              {/* The third way, and the one that actually works for someone
                  filling this in at a desk: long-press in Google Maps, copy the
                  coordinates, paste. No permission, no request, no map to pan
                  across a country. */}
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11.5, color: C.subtext }}>{x.pasteCoords}</span>
                <input
                  value={coordText}
                  onChange={(e) => {
                    setCoordText(e.target.value);
                    const parsed = parseCoords(e.target.value);
                    // Only WRITES on a valid parse. Clearing the draft while
                    // someone is mid-type would wipe a pin they already placed
                    // on the map above.
                    if (parsed) setDraft((d) => ({ ...d, lat: parsed.lat, lng: parsed.lng }));
                  }}
                  placeholder="30.04442, 31.23571"
                  dir="ltr"
                  inputMode="text"
                  autoComplete="off"
                  style={{
                    ...input,
                    borderColor: coordText.trim() && !parseCoords(coordText) ? errorA(0.4) : goldA(0.13),
                  }}
                />
                {coordText.trim() && !parseCoords(coordText) && (
                  <span style={{ fontSize: 11, color: C.error }}>{x.coordsUnreadable}</span>
                )}
              </label>
            </div>
          )}

          <div style={{ fontSize: 11, color: C.subtext, lineHeight: 1.5 }}>
            {x.pinHint}
          </div>
        </div>
        {error && <div style={{ color: C.error, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={busy || draft.name.trim().length < 2} style={primaryBtn(busy || draft.name.trim().length < 2)}>
            {busy ? x.saving : isEdit ? x.saveChanges : x.createListing}
          </button>
          {/* `isEdit || creating`, not `isEdit`: a merchant who tapped "add
              another" has a listing to go back TO, and without this the only
              way out of the form is to leave the tab. */}
          {(isEdit || creating) && (
            <button
              type="button"
              onClick={() => { setEditing(false); setCreating(false); setError(null); }}
              style={ghostBtn}
            >{x.cancel}</button>
          )}
        </div>
      </form>
    </section>
  );
}

const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '10px 16px', borderRadius: 8, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
  background: disabled ? `${goldA(0.2)}` : `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
  color: disabled ? C.subtext : C.onGold, fontWeight: 800, fontSize: 13, flex: 1,
});

const ghostBtn: React.CSSProperties = {
  padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
  background: 'transparent', color: C.gold, border: `1px solid ${goldA(0.267)}`,
  fontWeight: 700, fontSize: 12.5,
};
