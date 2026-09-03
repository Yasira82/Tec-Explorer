'use client';

// TEC Connect (C-107 §14.3) — Follow, from inside Explorer.
//
// The point of the whole idea: nobody is told to "open Connection". You are
// looking at a business, you can see who runs it, and you follow them here. The
// graph is still Connection's (C-107 §4) — Explorer only asks.
//
// 🔴 Every request goes to EXPLORER'S OWN BFF, never to Connection's API.
// `explorer.tecosystem.app` and `connection.tecosystem.app` are separate
// origins; a browser call across them is a third-party credentialed request,
// which is the exact case C-123 documents Pi Browser breaking. Built that way it
// works in Chrome and fails in Pi Browser — the worst kind of failure, because
// it passes every test.
//
// Deliberately Follow and not "Connect": Follow is what exists — one direction,
// no consent needed. A button labelled Connect that performs a Follow is a lie
// in the UI, and mutual connection is a whole feature (request, accept, reject,
// notify) that should not be invented on a business page.
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePiAuth, ssoRedirect } from '@yasser172/tec-auth';
import { useTranslation } from '@/lib/i18n';
import { reportError } from '@/lib/observability/reportError';
import { C, successA } from '@/lib-client/palette';

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? 'https://hub.tecosystem.app';

type State = 'idle' | 'busy' | 'done' | 'self' | 'failed';

export function FollowOwner({ username, headline, verified }: {
  username: string;
  headline: string;
  verified: boolean;
}) {
  const { t } = useTranslation();
  const x = t.explorer;
  const { isAuthenticated, isLoading, user } = usePiAuth();
  const [state, setState] = useState<State>('idle');
  // Auth resolves asynchronously and the effect re-runs; without this a single
  // intent becomes several POSTs and the label flickers between states.
  const settled = useRef(false);

  const norm = (u: string) => (u ?? '').trim().replace(/^@+/, '').toLowerCase();

  const follow = useCallback(async () => {
    setState('busy');
    try {
      const res = await fetch('/api/bff/connection/following', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      setState(res.ok ? 'done' : 'failed');
    } catch (err) {
      reportError(err, { where: 'FollowOwner.follow' });
      setState('failed');
    }
  }, [username]);

  useEffect(() => {
    if (isLoading || settled.current) return;

    // Your own listing. Said rather than offering a button the service refuses.
    if (isAuthenticated && user?.piUsername && norm(user.piUsername) === norm(username)) {
      settled.current = true;
      setState('self');
      return;
    }

    // Arrived back from sign-in having asked to follow. The intent rides in the
    // URL because the Hub already preserves `pathname + search` and hands it
    // back — nothing has to survive a redirect Pi Browser is rough with (C-123).
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get('follow');
    if (wanted && norm(wanted) === norm(username)) {
      // Spent when READ, before the request: left in the address bar it replays
      // on every refresh, and a shared screenshot of that URL would follow on
      // the reader's behalf.
      const url = new URL(window.location.href);
      url.searchParams.delete('follow');
      window.history.replaceState({}, '', url.toString());
      if (isAuthenticated) {
        settled.current = true;
        void follow();
        return;
      }
    }

    if (!isAuthenticated) return;

    // Already following? Ask once, so the button does not offer to do something
    // that is already done. A failure here leaves it offering — the POST is
    // idempotent upstream, so the worst case is a no-op.
    settled.current = true;
    void (async () => {
      try {
        const res = await fetch('/api/bff/connection/following', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) return;
        const { following } = (await res.json().catch(() => ({}))) as { following?: string[] };
        if ((following ?? []).some((f) => norm(f) === norm(username))) setState('done');
      } catch (err) {
        // The button stays offered — the POST is idempotent upstream, so the
        // worst case is a no-op. Reported anyway: this failing for everyone
        // means the pre-check is dead and nobody would notice (C-96).
        reportError(err, { where: 'FollowOwner.alreadyFollowing' });
      }
    })();
  }, [isLoading, isAuthenticated, user?.piUsername, username, follow]);

  const onClick = () => {
    if (state === 'busy' || state === 'done' || state === 'self') return;
    if (!isAuthenticated) {
      // Back to THIS page, carrying the intent. Sending someone to a login and
      // then to a home screen loses both the person and the reason they came.
      const back = `${window.location.origin}${window.location.pathname}?follow=${encodeURIComponent(username)}`;
      ssoRedirect(HUB_URL, back);
      return;
    }
    void follow();
  };

  const label =
    state === 'done'   ? x.following
    : state === 'self' ? x.thisIsYou
    : state === 'busy' ? '…'
    : (isLoading || isAuthenticated ? x.follow : x.followWithPi).replace('{name}', username);

  const inert = state === 'done' || state === 'self' || state === 'busy';

  return (
    <section style={{
      marginTop: 18, padding: '16px 18px', borderRadius: 14,
      background: C.surface, border: `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700, color: C.subtext }}>
        {x.runBy}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        {/* <bdi>: a Latin handle inside an RTL paragraph would render as
            "handle@" — the '@' is bidi-neutral and resolves against the
            surrounding direction. */}
        <bdi style={{ fontSize: 16, fontWeight: 800, color: C.text }}>@{username}</bdi>
        {verified && (
          <span
            title="Verified — presented from Zone / KYC, never minted by Explorer"
            style={{
              fontSize: 10.5, fontWeight: 700, color: C.success,
              background: successA(0.10), border: `1px solid ${successA(0.25)}`,
              borderRadius: 999, padding: '2px 8px',
            }}
          >{x.verifiedShort}</span>
        )}
      </div>
      {headline && (
        <p dir="auto" style={{ fontSize: 13, color: C.subtext, margin: '6px 0 0', lineHeight: 1.5 }}>
          {headline}
        </p>
      )}

      <button
        onClick={onClick}
        disabled={inert}
        style={{
          marginTop: 12, width: '100%', boxSizing: 'border-box',
          padding: '11px 18px', borderRadius: 999, border: 'none',
          background: inert
            ? C.surface2
            : `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
          color: inert ? C.subtext : C.onGold,
          fontSize: 14, fontWeight: 800, cursor: inert ? 'default' : 'pointer',
        }}
      ><bdi>{label}</bdi></button>

      {state === 'failed' && (
        <p style={{ fontSize: 12.5, color: C.error, margin: '10px 0 0' }}>
          {x.followFailed}
        </p>
      )}

      <p style={{ fontSize: 11, color: C.subtext, margin: '10px 0 0', lineHeight: 1.5 }}>
        {x.followNote}
      </p>
    </section>
  );
}
