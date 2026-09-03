/**
 * Read a coordinate pair out of whatever the merchant pasted.
 *
 * The realistic path onto this app's map, for someone whose browser refuses
 * geolocation, is: long-press in Google Maps → "Copy coordinates" → paste here.
 * So this accepts what that ACTUALLY puts on the clipboard, plus the shapes
 * people type by hand:
 *
 *     30.0444, 31.2357          the plain pair Google Maps copies
 *     30.0444,31.2357           without the space
 *     30.0444 31.2357           space-separated
 *     30.0444° N, 31.2357° E    the display form, degree signs and hemispheres
 *     -1.2921, 36.8219          southern / western, signed
 *     ٣٠٫٠٤٤٤, ٣١٫٢٣٥٧          Arabic-Indic digits, as an Arabic keyboard emits
 *
 * It returns null rather than throwing, and null for anything it is not sure
 * about — a wrong pin is worse than no pin, because a customer walks to it.
 */
export interface Coords { lat: number; lng: number }

/** Arabic-Indic and Persian digits → ASCII, and their decimal separator. */
function toAsciiDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    // U+066B is the Arabic decimal separator; it is NOT a comma, and treating
    // it as one would split "٣٠٫٠٤" into two numbers and quietly place the pin
    // thirty degrees away.
    .replace(/٫/g, '.')
    .replace(/٬/g, '');
}

export function parseCoords(raw: string): Coords | null {
  if (!raw) return null;
  const s = toAsciiDigits(raw).trim();

  // Hemisphere letters, if present, decide the sign — so "30.04 N, 31.23 W"
  // is read as a western longitude even though nothing is written negative.
  const hemis = s.toUpperCase().match(/[NSEW]/g) ?? [];
  const nums  = s.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length !== 2) return null;

  let [lat, lng] = nums.map(Number) as [number, number];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  if (hemis.length === 2) {
    // Only trust the letters when there are exactly two and they name one axis
    // each. "30 N 31 N" is not a place; refusing it is better than guessing.
    const [a, b] = hemis as [string, string];
    const latAxis = 'NS'.includes(a) && 'EW'.includes(b);
    const lngAxis = 'EW'.includes(a) && 'NS'.includes(b);
    if (!latAxis && !lngAxis) return null;
    if (lngAxis) [lat, lng] = [lng, lat];        // written longitude-first
    const latHemi = latAxis ? a : b;
    const lngHemi = latAxis ? b : a;
    lat = Math.abs(lat) * (latHemi === 'S' ? -1 : 1);
    lng = Math.abs(lng) * (lngHemi === 'W' ? -1 : 1);
  } else if (hemis.length !== 0) {
    return null;
  }

  // Out of range is a typo, not a location. Latitude runs to ±90 and longitude
  // to ±180, so a swapped pair like "31.2, 30.0" cannot be detected — but
  // "100, 30" can, and it is the common slip.
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  // Exactly 0,0 is Null Island: it is what an empty or unparsed field becomes
  // when someone reaches for Number(), and no shop is there. A merchant who
  // genuinely trades in the Gulf of Guinea can move the pin one metre.
  if (lat === 0 && lng === 0) return null;

  return { lat, lng };
}

/** How a pair is shown back — five places is roughly a metre. */
export const formatCoords = (c: Coords): string =>
  `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
