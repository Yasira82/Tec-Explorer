/**
 * The colours this app paints with, as CSS variables.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * Explorer paints almost entirely in inline styles, and it read its colours
 * from `TEC_COLORS` in `@yasser172/tec-ui`. Those are plain 6-digit hex strings
 * and they are RIGHT to be — the package's own contract test pins it, because
 * consumers append alpha to them across the fleet. But a hex literal baked into
 * a `style={{}}` cannot follow a theme. It is a value, decided once, at render.
 *
 * That is the entire reason light mode did not work here: the token file has
 * carried a `[data-theme='light']` block from the beginning, and not one
 * component ever read it.
 *
 * So the app keeps its inline styles and swaps what it puts IN them: a
 * `var(--tec-*)` reference, resolved by the browser at paint time, against
 * whichever theme block is currently winning. Same shape of code, one word
 * different, and the whole app follows the page.
 *
 * ── The trap this file exists to close ──────────────────────────────────────
 * About fifty places wanted a colour at partial opacity and got it by appending
 * two hex digits to a hex string:
 *
 *     border: `1px solid ${TEC_COLORS.gold}22`
 *
 * Pointing that at a variable produces `var(--tec-gold)22` — invalid CSS that
 * raises NO error anywhere. The declaration is dropped and the border silently
 * stops painting. Across a fleet, that is a border that vanishes everywhere at
 * once with nothing in any console to say so.
 *
 * `goldA()` and `inkA()` below are the answer: the token layer publishes the
 * CHANNELS (`--tec-gold-rgb`, `--tec-text-rgb`) and these wrap them in `rgba()`,
 * so opacity composes with a theme instead of fighting it.
 *
 * Never write `` `${C.gold}33` `` again. `guard` tests fail the build on it.
 */

/** Theme-aware colour references. Each resolves at paint time, not at render. */
export const C = {
  /** Page background. */
  bg:       'var(--tec-bg)',
  /** Card / panel. */
  surface:  'var(--tec-surface-1)',
  /** A tile inside a card. */
  surface2: 'var(--tec-surface-2)',
  /** Raised or pressed. */
  surface3: 'var(--tec-surface-3)',
  /** Hairline. */
  border:   'var(--tec-border)',

  /** Primary ink. */
  text:     'var(--tec-text-1)',
  /** Secondary ink — labels, captions, most of this app. */
  subtext:  'var(--tec-text-2)',
  /** Faintest readable ink. */
  faint:    'var(--tec-text-3)',

  /**
   * The brand amber — DIFFERENT in each theme, deliberately.
   *
   * #FBB44A is sampled from the Pi splash mark and carries a dark page. On
   * white it is a pale wash that fails as text and as a border, so the light
   * theme swaps in #FEA500 — Pi's own "Welcome to Pi" headline amber, the same
   * brand measured on a light ground. Which one applies is a theme decision and
   * lives in the token file; nothing here needs to know.
   */
  gold:     'var(--tec-gold)',
  goldDark: 'var(--tec-gold-dark)',
  /** Ink ON a filled amber button. Fixed in both themes — it is a solid object. */
  onGold:   'var(--tec-on-gold)',

  /** Status. Meaning, never decoration — so these do NOT flip with the theme. */
  success:  'var(--tec-green)',
  error:    'var(--tec-red)',
  info:     'var(--tec-blue)',

  /** A faint wash over the page — white on dark, black on light. */
  fill:     'var(--tec-fill-soft)',
} as const;

/**
 * The brand amber at partial opacity.
 *
 * Replaces `` `${TEC_COLORS.gold}22` ``. Takes the alpha as a NUMBER (0–1)
 * rather than the two hex digits the old form used, because 0.13 is a value a
 * person can reason about and `22` is one they have to decode.
 *
 * Rounded to three places: `rgba(251, 180, 74, 0.13333333333333333)` is valid
 * but it is noise in every inspector the CEO opens on a phone.
 */
export const goldA = (alpha: number): string =>
  `rgba(var(--tec-gold-rgb), ${round(alpha)})`;

/**
 * Ink at partial opacity — hairlines, chips, dividers.
 *
 * White on a dark page and BLACK on a light one, because the channels flip with
 * the theme. The old `` `${TEC_COLORS.subtext}44` `` could not: it was a fixed
 * grey that turned into an invisible smudge the moment the page went light.
 */
export const inkA = (alpha: number): string =>
  `rgba(var(--tec-text-rgb), ${round(alpha)})`;

/**
 * Success green at partial opacity.
 *
 * Status colours do NOT flip with the theme — green means the same thing on
 * both pages — but they still need a channel token, for the same reason as the
 * others: `var(--tec-green)66` is invalid CSS that fails silently.
 */
export const successA = (alpha: number): string =>
  `rgba(var(--tec-green-rgb), ${round(alpha)})`;

/**
 * Clamp to 0–1 and trim the tail.
 *
 * The sweep from `}22` to `goldA(0.133)` divided each old hex pair by 255, so
 * the numbers are reviewable against the originals — but
 * `rgba(251,180,74,0.13333333333333333)` is valid CSS and pure noise in the
 * inspector, and three places is well past the precision a screen can show.
 */
const round = (a: number): number =>
  Math.round(Math.min(1, Math.max(0, a)) * 1000) / 1000;
