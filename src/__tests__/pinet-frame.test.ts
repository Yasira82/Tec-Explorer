// @vitest-environment node
/**
 * PiNet shows the app inside a frame on <sub>.pinet.com (life4748.pinet.com, tec8887.pinet.com). The CSP let
 * only minepi.com frame the app, so Chrome showed the broken-page icon under PiNet's bar (owner, 27 Nov 2026).
 *
 * Safe to allow: frame-ancestors is checked against EVERY ancestor, and a pinet.com page is Pi's own wrapper.
 * Another developer's app appears there only as a frame from its own domain, so it cannot frame this app; a
 * page anywhere else still cannot frame it at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const directive = () => {
  const src = readFileSync(`${process.cwd()}/next.config.js`, 'utf8');
  // The directive itself, in its quoted string — not a mention of it in a comment.
  const all = [...src.matchAll(/"frame-ancestors ([^"]+)"/g)];
  expect(all).toHaveLength(1);
  return (all[0]?.[1] ?? '').trim().split(/\s+/);
};

describe('who may show this app in a frame', () => {
  it('PiNet (any *.pinet.com app page), Pi itself, and this app', () => {
    expect(directive()).toEqual(expect.arrayContaining(["'self'", '*.minepi.com', 'minepi.com', '*.pinet.com', 'pinet.com']));
  });
  it('nobody else — no wildcard, no scheme', () => {
    for (const s of directive()) expect(s).not.toMatch(/^(\*|https?:|http:\/\/\*|https:\/\/\*)$/);
  });
});
