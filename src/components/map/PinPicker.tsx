'use client';

// Put your shop on the map by TAPPING it.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// Setting a pin used to have exactly one path: `navigator.geolocation`. When the
// browser refuses — and Pi Browser is a webview whose host app decides that, not
// the page — the merchant hit a dead end and could never appear on the map at
// all. A form with one way to fill a field is a form that fails completely the
// moment that way is unavailable.
//
// Tapping needs no permission, no API key and no request beyond the map tiles
// the app already loads. It is also often MORE accurate than standing in the
// shop: a merchant filling this in at home can still place the pin exactly on
// their door, which "use my current location" can never do.
import { useEffect, useRef } from 'react';
import { C, goldA } from '@/lib-client/palette';

export interface PinPickerProps {
  /** The pin as it stands, or null when none has been set. */
  value: { lat: number; lng: number } | null;
  onChange: (pos: { lat: number; lng: number }) => void;
  /** Label for the marker's accessible name, in the reader's language. */
  label: string;
}

export default function PinPicker({ value, onChange, label }: PinPickerProps) {
  const host    = useRef<HTMLDivElement | null>(null);
  const mapRef  = useRef<import('leaflet').Map | null>(null);
  const markRef = useRef<import('leaflet').Marker | null>(null);
  // Held in a ref so the map's click handler always calls the CURRENT callback
  // without the map being torn down and rebuilt on every parent render — which
  // would throw away the merchant's pan and zoom mid-placement.
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    void (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !host.current || mapRef.current) return;

      const map = L.map(host.current, { attributionControl: true, zoomControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      // An existing pin opens close in. With none, the view is deliberately wide
      // rather than centred on a guess: dropping someone in the wrong city and
      // letting them think it is right is worse than making them zoom.
      if (value) map.setView([value.lat, value.lng], 16);
      else map.setView([20, 10], 2);

      const icon = L.divIcon({
        className: '',
        html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;
                 transform:rotate(-45deg);background:${C.gold};
                 border:2px solid ${C.surface};box-shadow:var(--shadow-md)"></div>`,
        iconSize: [26, 26], iconAnchor: [13, 26],
      });

      const place = (lat: number, lng: number) => {
        if (markRef.current) markRef.current.setLatLng([lat, lng]);
        else markRef.current = L.marker([lat, lng], { icon, draggable: true, title: label })
          .addTo(map)
          // Draggable as well as tappable: nudging a pin a few metres by
          // dragging is far easier on a phone than tapping a precise point.
          .on('dragend', (e) => {
            const p = (e.target as import('leaflet').Marker).getLatLng();
            cb.current({ lat: p.lat, lng: p.lng });
          });
      };

      if (value) place(value.lat, value.lng);

      map.on('click', (e) => {
        place(e.latlng.lat, e.latlng.lng);
        cb.current({ lat: e.latlng.lat, lng: e.latlng.lng });
      });

      mapRef.current = map;
      // The map is sized before its container has finished laying out inside a
      // form, which renders it as grey tiles until something forces a resize.
      setTimeout(() => map.invalidateSize(), 60);

      cleanup = () => { map.remove(); mapRef.current = null; markRef.current = null; };
    })();

    return () => { cancelled = true; cleanup(); };
    // Deliberately mounts ONCE. `value` is read for the initial view only; the
    // effect below moves the pin afterwards, so typing coordinates does not
    // rebuild the map underneath the person using it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the pin in step when the value changes from OUTSIDE the map — the
  // "use my location" button, or coordinates pasted into the field beside it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !value) return;
    if (markRef.current) markRef.current.setLatLng([value.lat, value.lng]);
    map.setView([value.lat, value.lng], Math.max(map.getZoom(), 16));
  }, [value]);

  return (
    <div
      ref={host}
      style={{
        height: 260, width: '100%', borderRadius: 10, overflow: 'hidden',
        border: `1px solid ${goldA(0.2)}`, background: C.surface2,
      }}
    />
  );
}
