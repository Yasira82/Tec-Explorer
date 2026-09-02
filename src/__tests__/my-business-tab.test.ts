import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The "My Business" tab rendered a completely blank screen for every signed-in
// user in Pi Browser, and said nothing at all when signed out.
//
// One cause, two defects:
//
//   1. It was handed `isAuthenticated` from `usePiAuth()`, which answers from
//      `document.cookie`. Pi Browser stores `tec_user` so the SERVER sees it and
//      client JS does not (C-123 §3) — so on the only platform this app ships
//      to, that value is always false. The page ALREADY knew this: it uses
//      `useMe()` (a server round-trip) for the greeting in the header, and
//      SettingsView merges both. This one call site was missed.
//
//   2. `if (!isAuth || !loaded) return null` — every failure mode rendered
//      NOTHING. A blank tab is indistinguishable from a broken app, so the bug
//      could not be told apart from a crash by the person looking at it.
//
// These check the code, because the bug is in which SOURCE of truth is wired in
// — something a render test with a mocked hook would happily agree with.
const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');

const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

describe('the My Business tab is wired to the session the server can see', () => {
  const page = strip(src('app/app/page.tsx'));

  it('passes the server-resolved session, not the cookie-read one', () => {
    const call = page.match(/<ListingPanel[^>]*\/>/s)?.[0] ?? '';
    expect(call).toBeTruthy();
    expect(call).toContain('me.authenticated');
  });

  it('does not pass the client-only flag ALONE', () => {
    // `isAuthenticated` may still appear as a fallback; what must never return
    // is it being the whole answer.
    const call = page.match(/<ListingPanel[^>]*\/>/s)?.[0] ?? '';
    expect(call).not.toMatch(/isAuth=\{\s*isAuthenticated\s*\}/);
  });

  it('the check can actually fail', () => {
    // Guard against a matcher that passes on anything.
    expect('<ListingPanel isAuth={isAuthenticated} />')
      .toMatch(/isAuth=\{\s*isAuthenticated\s*\}/);
  });
});

describe('no branch of the panel renders an empty screen', () => {
  const panel = strip(src('app/app/components/ListingPanel.tsx'));

  it('never bails out with a bare `return null`', () => {
    expect(panel).not.toMatch(/return\s+null\s*;/);
  });

  it('offers a way in when signed out instead of staying silent', () => {
    expect(panel).toContain('ssoRedirect');
  });

  it('says something while the session is still resolving', () => {
    // The answer arrives over the network, so there is a real gap to fill.
    expect(panel).toMatch(/authLoading/);
  });
});

// The owner cap went from one business to five. A panel that keeps rendering
// `listings[0]` does not show a merchant fewer businesses — it shows them a
// MISSING business, with nothing on screen to suggest the others exist. These
// pin the three things that make the extra listings reachable at all.
describe('every business the merchant owns is reachable', () => {
  const panel = strip(src('app/app/components/ListingPanel.tsx'));

  it('holds all of them, not just the first', () => {
    expect(panel).toMatch(/listings.*useState<Listing\[\]>/s);
    // The classic regression: quietly narrowing back to one.
    expect(panel).not.toMatch(/setListing\(\s*own\[0\]/);
  });

  it('renders one control per listing so a second one can be opened', () => {
    expect(panel).toMatch(/listings\.map\(/);
    expect(panel).toContain('setSelectedId(l.id)');
  });

  it('separates "edit this one" from "add another" so adding cannot overwrite', () => {
    // Both open the same form. If `save()` decided on form-is-open rather than
    // on WHICH intent opened it, "add another" would PATCH the selected
    // business instead of creating one.
    expect(panel).toMatch(/const isEdit = listing !== null && editing/);
    expect(panel).toContain('setCreating(true)');
  });

  it('does not offer an add button that the backend will refuse', () => {
    expect(panel).toMatch(/atCap \?/);
  });

  it('the narrowing check can actually fail', () => {
    expect('setListing(own[0] ?? null)').toMatch(/setListing\(\s*own\[0\]/);
  });
});
