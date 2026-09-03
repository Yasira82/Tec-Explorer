'use client';

// The map of Pi-accepting businesses.
//
// Leaflet + OpenStreetMap, deliberately, over Google Maps: no API key, so
// nothing to leak in the client bundle and nothing to bill; and it renders in a
// plain webview, which is what Pi Browser is. A keyed map SDK would mean a
// NEXT_PUBLIC_* secret-shaped value in the bundle and a per-load cost on an app
// whose whole point is being opened by people browsing casually.
//
// Loaded through a dynamic import with no SSR: Leaflet reaches for `window` at
// module scope, so importing it normally breaks the build, not just the render.
import { useEffect, useRef } from 'react';
import { CATEGORY_META, type MappableListing } from '@/lib/explorer/directory';
import { trustLevel } from '@/lib/explorer/trust';
import type { Position } from '@/lib-client/geo';
import { C, goldA, inkA } from '@/lib-client/palette';

/**
 * Escape text before it goes into a Leaflet popup.
 *
 * Popups take an HTML STRING, not React — so every value here is raw
 * interpolation into markup, and a business name is merchant-supplied. Without
 * this, naming your shop `<img onerror=…>` executes for everyone who opens the
 * map. React's escaping does not reach inside `bindPopup`.
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
));

export default function BusinessMap({ listings, me, onOpen }: {
  listings: MappableListing[];
  /** The visitor, if they asked to be located. Drawn, never sent anywhere. */
  me?: Position | null;
  onOpen?: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  // Kept across renders so markers can be replaced without rebuilding the map —
  // recreating it would reset the visitor's pan and zoom on every keystroke of
  // the search box.
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const layerRef = useRef<import('leaflet').LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    void (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !host.current || mapRef.current) return;

      const map = L.map(host.current, { attributionControl: true, zoomControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        // Required by the OSM tile usage policy — attribution is the licence
        // term, not decoration.
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      // A map sized before its container has laid out renders as grey tiles.
      setTimeout(() => map.invalidateSize(), 0);

      cleanup = () => { map.remove(); mapRef.current = null; layerRef.current = null; };
    })();

    return () => { cancelled = true; cleanup(); };
  }, []);

  // Markers + framing, re-run whenever the result set or the visitor moves.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import('leaflet')).default;
      const map = mapRef.current;
      const layer = layerRef.current;
      if (cancelled || !map || !layer) return;

      layer.clearLayers();

      const icon = (emoji: string, ring: string) => L.divIcon({
        className: '',
        html: `<div style="width:30px;height:30px;border-radius:50%;display:grid;place-items:center;
                 background:${C.surface};border:2px solid ${ring};font-size:15px;
                 box-shadow:var(--shadow-md)">${emoji}</div>`,
        iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -16],
      });

      for (const l of listings) {
        const meta = CATEGORY_META[l.category];
        const level = trustLevel(l);
        const m = L.marker([l.lat, l.lng], {
          icon: icon(meta?.icon ?? '📍', level === 1 ? inkA(0.533) : C.gold),
          title: l.name,
        }).addTo(layer);

        // Every interpolated value is escaped — this is an HTML string, and the
        // name and summary are written by merchants.
        m.bindPopup(
          `<div style="font-family:system-ui;min-width:150px">
             <strong>${esc(l.name)}</strong>${level === 3 ? ' ✅' : ''}
             <div style="opacity:.75;margin-top:2px">${esc(meta?.label ?? '')} · ${esc(l.area)}</div>
             <div style="margin-top:6px">${esc(l.summary)}</div>
           </div>`,
        );
        if (onOpen) m.on('click', () => onOpen(l.id));
      }

      if (me) {
        L.circleMarker([me.lat, me.lng], {
          radius: 7, color: C.info, fillColor: C.info, fillOpacity: 0.9, weight: 2,
        }).addTo(layer).bindPopup('You are here');
      }

      // Frame everything there is to see. With nothing to frame, stay put rather
      // than snapping to (0,0) — Null Island is a worse answer than no move.
      const points: [number, number][] = listings.map((l) => [l.lat, l.lng]);
      if (me) points.push([me.lat, me.lng]);
      if (points.length === 1) map.setView(points[0]!, 15);
      else if (points.length > 1) map.fitBounds(L.latLngBounds(points).pad(0.15));
      else if (!map.getZoom()) map.setView([26.8, 30.8], 5);
    })();
    return () => { cancelled = true; };
  }, [listings, me, onOpen]);

  return (
    <div
      ref={host}
      // A fixed height, because a Leaflet container with `height:auto` collapses
      // to zero and shows nothing at all.
      style={{
        height: 340, width: '100%', borderRadius: 12, overflow: 'hidden',
        border: `1px solid ${goldA(0.133)}`, background: C.surface,
      }}
    />
  );
}
