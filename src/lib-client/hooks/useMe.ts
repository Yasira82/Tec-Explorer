'use client';

// Server-resolved session identity (C-123 §3). The client must NOT decide "who am I?"
// from document.cookie — Pi Browser stores the tec_user cookie so the SERVER sees it
// while hiding it from client JS, so getStoredUser()/usePiAuth() read null and the real
// Pi username never appears. /api/auth/me reads the request cookie server-side and
// returns the actual user. Fail closed (P6).
import { useEffect, useState } from 'react';

interface Me { username: string | null; authenticated: boolean; loading: boolean }

export function useMe(): Me {
  const [me, setMe] = useState<Me>({ username: null, authenticated: false, loading: true });

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        const u = (d?.user ?? null) as Record<string, unknown> | null;
        const raw = u?.piUsername ?? u?.username ?? null;
        setMe({
          username: typeof raw === 'string' && raw ? raw : null,
          authenticated: d?.authenticated === true,
          loading: false,
        });
      })
      .catch(() => { if (alive) setMe((p) => ({ ...p, loading: false })); });
    return () => { alive = false; };
  }, []);

  return me;
}
