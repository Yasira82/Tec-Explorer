'use client';

// "Who near me accepts Pi?" — the question Explorer exists to answer (C-108).
//
// 🔴 THE PRIVACY RULE, AND IT IS THE WHOLE DESIGN:
// the searcher's position NEVER LEAVES THE BROWSER. C-108 §6 says location is
// used for search and never stored, so the honest implementation is not "we
// promise not to log it" — it is never sending it. The server returns businesses
// with the coordinates their owners chose to publish, and the distance from you
// to each of them is arithmetic done on this device.
//
// That is why `distanceKm` lives in a client module and there is no `?lat=&lng=`
// anywhere in this app. A server-side radius query would be faster at a million
// listings, and it would also mean the server sees where every user is standing.
// When the index outgrows this, the replacement has to keep that property —
// coarse geohash buckets, or a radius query whose input is never logged — not a
// plain lat/lng in a request line that lands in an access log by default.
import { useCallback, useEffect, useState } from 'react';

export interface Position { lat: number; lng: number }

/** Metres per degree of latitude — the equatorial radius, close enough for "near me". */
const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in kilometres.
 *
 * Haversine rather than a flat-earth approximation: the cheap version is fine
 * for a city and wrong by a useful margin at the distances a "Remote" listing
 * can sit at, and a distance shown to a user should not be wrong in a way they
 * could notice.
 */
export function distanceKm(a: Position, b: Position): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** "450 m" / "2.3 km" / "17 km" — the precision a person can act on. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 100) * 10} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export type GeoState =
  | { status: 'idle' }
  | { status: 'asking' }
  | { status: 'ready'; position: Position }
  | { status: 'denied' }
  | { status: 'unavailable' };

/**
 * The visitor's position, only after they ask for it.
 *
 * Never requested on mount. C-108 §6 requires explicit consent, and a permission
 * prompt that appears because a page loaded is the kind that gets denied
 * permanently — after which "near me" is dead for that person on that device
 * with no way back through the app.
 *
 * The three failure states are kept apart because they need different words:
 * "denied" is a decision the visitor made and can undo in browser settings,
 * "unavailable" is a device or webview that cannot answer at all. Telling
 * someone to "allow location" when their browser has no geolocation API is
 * advice that cannot work.
 */
export function useNearMe() {
  const [state, setState] = useState<GeoState>({ status: 'idle' });

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ status: 'unavailable' });
      return;
    }
    setState({ status: 'asking' });
    navigator.geolocation.getCurrentPosition(
      (p) => setState({ status: 'ready', position: { lat: p.coords.latitude, lng: p.coords.longitude } }),
      (err) => setState(err.code === err.PERMISSION_DENIED
        ? { status: 'denied' }
        : { status: 'unavailable' }),
      // No high accuracy: "which shops are near me" does not need GPS-grade
      // precision, and asking for it costs battery and a long wait indoors —
      // exactly where a Pi Browser user tends to be standing.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const clear = useCallback(() => setState({ status: 'idle' }), []);

  return { state, request, clear };
}

/**
 * Whether the visitor has already granted location, WITHOUT asking.
 *
 * Lets the button read "Near me" rather than "Allow location" for someone who
 * already said yes. The Permissions API is absent in some webviews, and the
 * answer there is simply "don't know" — never an assumption either way.
 */
export function useGeoPermissionKnown(): 'granted' | 'unknown' {
  const [known, setKnown] = useState<'granted' | 'unknown'>('unknown');
  useEffect(() => {
    let alive = true;
    const perms = typeof navigator !== 'undefined'
      ? (navigator as Navigator & { permissions?: Permissions }).permissions
      : undefined;
    if (!perms?.query) return;
    perms.query({ name: 'geolocation' as PermissionName })
      .then((r) => { if (alive && r.state === 'granted') setKnown('granted'); })
      .catch(() => { /* not supported — stays unknown, which is the honest answer */ });
    return () => { alive = false; };
  }, []);
  return known;
}
