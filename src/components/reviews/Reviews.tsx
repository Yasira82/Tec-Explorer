'use client';

// What customers said, and how much TEC can corroborate it (C-108).
//
// ── The honesty this component is built around ──────────────────────────────
// A Pi payment made AT a shop never passes through TEC — the customer pays the
// merchant directly (C-108 §4). So for the ordinary case there is NO record
// proving a reviewer was ever a customer, and "verified purchases only" is a
// rule that cannot be enforced. Awarding the badge anyway would be worse than
// having none: a badge that means nothing devalues every real one.
//
// So each review shows its evidence, plainly, and the reader weighs it:
//   · "Verified purchase" — a payment from this person to this business exists.
//   · "Signed in with Pi" — a real authenticated account, nothing more claimed.
//
// Today the backend never returns the first (there is no lookup that could
// answer it truthfully yet), so every review honestly shows the second. This
// component renders whichever it is told, so the day that lookup exists nothing
// here changes.
import { useCallback, useEffect, useState } from 'react';
import { usePiAuth, ssoRedirect } from '@yasser172/tec-auth';
import { useMe } from '@/lib-client/hooks/useMe';
import { useTranslation } from '@/lib/i18n';
import { ReportButton } from '@/components/report/ReportButton';
import { reportError } from '@/lib/observability/reportError';
import { C, goldA, inkA } from '@/lib-client/palette';

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? 'https://hub.tecosystem.app';

interface Review {
  id: string; author: string; rating: number; body: string;
  evidence: 'VERIFIED_PURCHASE' | 'SIGNED_IN';
  created_at: string;
}
interface Summary { count: number; average: number | null; verifiedCount: number }

const Stars = ({ n }: { n: number }) => (
  <span aria-label={`${n} out of 5`} style={{ letterSpacing: 1 }}>
    <span style={{ color: C.gold }}>{'★'.repeat(n)}</span>
    <span style={{ color: `${inkA(0.533)}` }}>{'★'.repeat(5 - n)}</span>
  </span>
);

export function Reviews({ handle, ownerUsername }: {
  handle: string;
  /** The listing's owner, so a merchant is not offered a form the API refuses. */
  ownerUsername?: string;
}) {
  const { t } = useTranslation();
  const x = t.explorer;
  const { isAuthenticated } = usePiAuth();
  // Pi Browser hides tec_user from client JS (C-123 §3), so the server-resolved
  // answer is the one that works on the platform this ships to.
  const me = useMe();
  const signedIn = me.authenticated || isAuthenticated;
  const myName = me.username ?? null;

  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<Summary>({ count: 0, average: null, verifiedCount: 0 });
  const [loaded, setLoaded] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bff/explorer/reviews?handle=${encodeURIComponent(handle)}`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (data) { setReviews(data.reviews ?? []); setSummary(data.summary ?? summary); }
    } catch (err) {
      // The SECTION still degrades quietly — a reader cannot act on a review
      // fetch failing. But it is no longer invisible to us: a silent catch is
      // how "reviews stopped loading for everyone" goes unnoticed (C-96).
      reportError(err, { where: 'Reviews.load', handle });
    }
    finally { setLoaded(true); }
    // `summary` is only a fallback value here; depending on it would reload on
    // every fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  useEffect(() => { void load(); }, [load]);

  const mine = myName ? reviews.find((r) => r.author === myName) ?? null : null;
  const isOwner = !!(myName && ownerUsername && myName === ownerUsername);

  // Prefill from an existing review so "edit" starts where the person left off,
  // rather than making them retype it to change a star.
  useEffect(() => {
    if (mine) { setRating(mine.rating); setBody(mine.body); }
  }, [mine]);

  async function submit() {
    if (busy || rating < 1) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/bff/explorer/reviews?handle=${encodeURIComponent(handle)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? x.reviewFailed); return; }
      await load();
    } catch (err) {
      reportError(err, { where: 'Reviews.submit', handle });
      setError(x.networkError);
    }
    finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError(null);
    try {
      await fetch(`/api/bff/explorer/reviews?handle=${encodeURIComponent(handle)}`, { method: 'DELETE' });
      setRating(0); setBody('');
      await load();
    } catch (err) {
      reportError(err, { where: 'Reviews.remove', handle });
      setError(x.networkError);
    }
    finally { setBusy(false); }
  }

  const card: React.CSSProperties = {
    background: C.surface, border: `1px solid ${goldA(0.133)}`,
    borderRadius: 12, padding: 14,
  };

  if (!loaded) return null;

  return (
    <section style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: 0 }}>{x.reviews}</h2>
        {/* `average === null` is "nobody has reviewed this", NOT a score of
            zero. Rendering 0 for a new shop would libel it. */}
        {summary.average !== null ? (
          <span style={{ fontSize: 13, color: C.subtext }}>
            <strong style={{ color: C.gold }}>{summary.average.toFixed(1)}</strong>
            {' '}{x.fromNReviews.replace('{n}', String(summary.count))}
          </span>
        ) : (
          <span style={{ fontSize: 12.5, color: C.subtext }}>{x.noReviews}</span>
        )}
      </div>

      {/* Write / edit */}
      <div style={{ ...card, marginTop: 10 }}>
        {isOwner ? (
          <p style={{ fontSize: 12.5, color: C.subtext, margin: 0, lineHeight: 1.5 }}>
            {x.ownBusiness}
          </p>
        ) : !signedIn ? (
          <>
            <p style={{ fontSize: 12.5, color: C.subtext, margin: '0 0 10px', lineHeight: 1.5 }}>
              {x.reviewPitch}
            </p>
            <button
              onClick={() => ssoRedirect(HUB_URL, `${window.location.origin}${window.location.pathname}`)}
              style={primary(false)}
            >{x.signIn}</button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n} onClick={() => setRating(n)} aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px',
                    fontSize: 24, lineHeight: 1,
                    color: n <= rating ? C.gold : `${inkA(0.4)}`,
                  }}
                >★</button>
              ))}
            </div>
            <textarea
              value={body} onChange={(e) => setBody(e.target.value)} maxLength={600} rows={3}
              dir="auto" placeholder={x.reviewPlaceholder}
              style={{
                width: '100%', boxSizing: 'border-box', marginTop: 10, padding: '9px 11px',
                background: C.bg, color: C.text, resize: 'vertical',
                border: `1px solid ${goldA(0.133)}`, borderRadius: 8, fontSize: 13,
                outline: 'none', fontFamily: 'inherit',
              }}
            />
            {error && <div style={{ fontSize: 12.5, color: C.error, marginTop: 8 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button onClick={() => void submit()} disabled={busy || rating < 1} style={primary(busy || rating < 1)}>
                {busy ? x.reviewSaving : mine ? x.updateReview : x.postReview}
              </button>
              {mine && (
                <button onClick={() => void remove()} disabled={busy} style={ghost}>{x.deleteMine}</button>
              )}
            </div>
          </>
        )}
      </div>

      {/* The reviews themselves */}
      <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
        {reviews.map((r) => {
          const verified = r.evidence === 'VERIFIED_PURCHASE';
          return (
            <div key={r.id} style={card}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
                  <bdi>@{r.author}</bdi>
                </span>
                <Stars n={r.rating} />
              </div>
              {/* The evidence, stated on every review rather than only on the
                  strong ones — a badge shown on some and nothing on the rest
                  leaves the reader guessing what the absence means. */}
              <div style={{
                display: 'inline-block', marginTop: 6, fontSize: 10.5, fontWeight: 700,
                borderRadius: 999, padding: '2px 8px',
                color: verified ? C.success : C.subtext,
                background: verified ? 'rgba(34,197,94,0.10)' : 'transparent',
                border: `1px solid ${verified ? 'rgba(34,197,94,0.25)' : `${inkA(0.267)}`}`,
              }}>
                {verified ? x.verifiedPurchase : x.signedInWithPi}
              </div>
              {r.body && (
                <p dir="auto" style={{ fontSize: 13, color: C.subtext, margin: '8px 0 0', lineHeight: 1.55 }}>
                  {r.body}
                </p>
              )}
              {/* Not offered on your own review — the API refuses it, and an
                  option that is shown and then refused teaches people to
                  distrust the whole menu. */}
              <ReportButton targetKind="review" targetId={r.id} canReport={r.author !== myName} />
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 11, color: C.subtext, margin: '10px 0 0', lineHeight: 1.5 }}>
        {x.reviewsNote}
      </p>
    </section>
  );
}

const primary = (disabled: boolean): React.CSSProperties => ({
  padding: '9px 16px', borderRadius: 999, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
  background: disabled ? `${goldA(0.2)}` : `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
  color: disabled ? C.subtext : C.onGold, fontWeight: 800, fontSize: 13,
});

const ghost: React.CSSProperties = {
  padding: '9px 14px', borderRadius: 999, cursor: 'pointer', background: 'transparent',
  color: C.subtext, border: `1px solid ${inkA(0.267)}`, fontWeight: 700, fontSize: 12.5,
};
