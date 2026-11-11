/**
 * The space Android's own buttons take at the bottom of the screen, when the
 * browser draws the page underneath them and does not say so.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * This app's bottom bar pads itself with `env(safe-area-inset-bottom)`. On the
 * owner's phone (Android, three-button navigation, Pi Browser, 10–11 Nov 2026)
 * the bar sat UNDER Back / Home / Recents: Pi Browser lays the page out edge to
 * edge and reports an inset of 0, so the padding was 0 and the bar's buttons
 * were behind the system's — nothing there could be tapped. The Hub had the
 * same fault and the same fix (tec-app #323).
 *
 * The page cannot measure the system's button bar. What it can know is whether
 * the browser gave it an inset at all. So on Android, when the inset reads 0,
 * the page reserves the height of the three-button bar (48px, Android's own
 * size). Where the browser does report an inset, that value wins; on every
 * other platform nothing changes.
 *
 * Cost of being wrong the other way: on an Android browser that keeps the page
 * above its buttons, the bar is 48px taller than it needs to be. A bar that is
 * a little tall can still be used; one under the system's buttons cannot.
 *
 * Read it with SAFE_BOTTOM (below) wherever `env(safe-area-inset-bottom)` was
 * used — `src/__tests__/safe-bottom.test.ts` fails on a bare one.
 */
export const ANDROID_NAV_FALLBACK_PX = 48;

/** The bottom inset to use in a style: the browser's, or the Android fallback. */
export const SAFE_BOTTOM = 'max(env(safe-area-inset-bottom), var(--tec-safe-bottom-fallback, 0px))';

/** Pure decision, so it can be tested without a browser. */
export const safeBottomFallback = (userAgent: string, reportedInsetPx: number): number =>
  /Android/i.test(userAgent) && !(reportedInsetPx > 0) ? ANDROID_NAV_FALLBACK_PX : 0;

/**
 * Inline, synchronous, in <head> before first paint: a bar that jumps up after
 * the page has painted is a tap that lands on the wrong button. Self-contained
 * (no imports): it runs as a string. The 48 is written out, not interpolated —
 * the test pins it to ANDROID_NAV_FALLBACK_PX.
 */
export const SAFE_BOTTOM_BOOT_SCRIPT = `(function(){try{
var ua=navigator.userAgent||'';
if(!/Android/i.test(ua))return;
var p=document.createElement('div');
p.style.cssText='position:fixed;left:0;bottom:0;height:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)';
document.documentElement.appendChild(p);
var inset=parseFloat(getComputedStyle(p).paddingBottom)||0;
p.parentNode.removeChild(p);
if(inset>0)return;
document.documentElement.style.setProperty('--tec-safe-bottom-fallback','48px');
}catch(e){}})();`;
