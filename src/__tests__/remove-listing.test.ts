import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// A merchant could create a listing, edit it and photograph it — and never take
// it down. A shop that closed kept an advert telling people to come, and the
// index whose only value is being TRUE was the thing left lying.
//
// Removal is the one action here that cannot be undone, so these pin the parts
// that make it safe rather than merely present.
const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');

const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

describe('the BFF never decides whose listing it is', () => {
  const route = strip(src('app/api/bff/explorer/business/[id]/route.ts'));

  it('has a DELETE handler', () => {
    expect(route).toMatch(/export async function DELETE/);
  });

  it('refuses without a session, before touching the backend', () => {
    const del = route.slice(route.indexOf('export async function DELETE'));
    expect(del).toContain("req.cookies.get('tec_access_token')");
    // P6: the 401 must come first. A route that calls the backend and then
    // checks is one refactor away from not checking.
    expect(del.indexOf('401')).toBeLessThan(del.indexOf('deleteListingBackend'));
  });

  it('forwards the handle and the token — and nothing about ownership', () => {
    const del = route.slice(route.indexOf('export async function DELETE'));
    expect(del).toMatch(/deleteListingBackend\(token, id\)/);
    // The owner is derived from the JWT in the backend. Any owner-ish field
    // read from the request here would be a client claiming whose shop it is.
    expect(del).not.toMatch(/body|owner|username/);
  });

  it('does not validate CSRF in the handler (middleware only — KB C-12 §11)', () => {
    expect(route).not.toMatch(/csrf.{0,20}!==/i);
  });
});

describe('removal cannot be triggered by a stray tap', () => {
  const panel = strip(src('app/app/components/ListingPanel.tsx'));

  it('is gated on a typed word, not a second tap', () => {
    // A phone dismisses a confirm dialog with the same thumb motion that opened
    // it. Typing is the one gesture that cannot happen by accident.
    expect(panel).toMatch(/typed\.trim\(\)\.toUpperCase\(\) !== x\.removeWord/);
  });

  it('the confirm button is disabled until the word matches', () => {
    const btn = panel.slice(panel.indexOf('x.removeConfirm'));
    expect(panel).toMatch(/disabled=\{busy \|\| typed\.trim\(\)\.toUpperCase\(\) !== x\.removeWord\}/);
    expect(btn.length).toBeGreaterThan(0);
  });

  it('states what happens, including the part the merchant cannot see', () => {
    // Reviews survive but become unreachable. Leaving that out would make the
    // action feel smaller than it is.
    expect(panel).toContain('x.removeConfirmB');
  });

  it('does not carry a half-typed confirmation onto a different business', () => {
    const sw = panel.slice(panel.indexOf('setSelectedId(l.id)'));
    expect(sw.slice(0, 400)).toContain('setConfirming(false)');
  });

  it('says the removal happened', () => {
    // Success looks like absence: the card stops being there, and on the last
    // listing the create form appears — which reads as the app losing the
    // business rather than doing what was asked.
    expect(panel).toContain('removedBanner');
    expect(panel).toContain('x.removedOk');
  });

  it('reports a failed removal instead of swallowing it', () => {
    const fn = panel.slice(panel.indexOf('async function removeListing'));
    expect(fn.slice(0, 1200)).toContain('reportError');
  });
});

describe('the confirm word survives a right-to-left page', () => {
  const en = readFileSync(join(process.cwd(), 'src/lib/i18n/en.ts'), 'utf8');
  const ar = readFileSync(join(process.cwd(), 'src/lib/i18n/ar.ts'), 'utf8');
  const panel = strip(src('app/app/components/ListingPanel.tsx'));

  it('is the same Latin word in every language', () => {
    // The comparison is `toUpperCase() === x.removeWord`. A translated word
    // would be fine on its own — but the input is forced LTR below, and a
    // right-aligned box asking for an Arabic word fights the person typing it.
    expect(en).toMatch(/removeWord:\s*'REMOVE'/);
    expect(ar).toMatch(/removeWord:\s*'REMOVE'/);
  });

  it('the confirm input is forced left-to-right', () => {
    const box = panel.slice(panel.indexOf('value={typed}'));
    expect(box.slice(0, 400)).toContain('dir="ltr"');
  });
});
