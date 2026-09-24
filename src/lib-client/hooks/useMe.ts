'use client';

// Server-resolved session identity (C-123 §3). The client must NOT decide "who am I?"
// from document.cookie — Pi Browser stores the tec_user cookie so the SERVER sees it
// while hiding it from client JS, so getStoredUser()/usePiAuth() read null and the real
// Pi username never appears. /api/auth/me reads the request cookie server-side and
// returns the actual user. Fail closed (P6).
import { useEffect, useState } from 'react';

interface Me {
  username: string | null;
  authenticated: boolean;
  loading: boolean;
  /**
   * Why `/me` said no, in the words it used: `no_token` · `no_user` · `bad_user`
   * from the route, `http_<status>` for anything else, `network` when the request
   * never answered. Never a value from the session.
   *
   * It exists for one observation: an app opened from the Hub's Quest rendered
   * `/app` — which the page guard only serves to a WHOLE session — and the same
   * page then said "Not signed in", on some visits and not others. A check opened
   * by hand is a full navigation and says the session is fine; only this request,
   * from this page, can say what it was told.
   */
  reason: string | null;
}

export function useMe(): Me {
  const [me, setMe] = useState<Me>({ username: null, authenticated: false, loading: true, reason: null });

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => null) as Record<string, unknown> | null;
        if (!alive) return;
        const u = (r.ok ? d?.user ?? null : null) as Record<string, unknown> | null;
        const raw = u?.piUsername ?? u?.username ?? null;
        const said = typeof d?.reason === 'string' && /^[a-z_]{1,24}$/.test(d.reason) ? d.reason : null;
        setMe({
          username: typeof raw === 'string' && raw ? raw : null,
          authenticated: r.ok && d?.authenticated === true,
          loading: false,
          reason: r.ok ? null : said ?? `http_${r.status}`,
        });
      })
      .catch(() => { if (alive) setMe((p) => ({ ...p, loading: false, reason: 'network' })); });
    return () => { alive = false; };
  }, []);

  return me;
}
