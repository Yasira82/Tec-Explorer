import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCoords, formatCoords } from '@/lib-client/coords';

// Setting a pin had exactly ONE path: navigator.geolocation. When the browser
// refuses — and Pi Browser is a webview whose HOST app decides that, not the
// page — the merchant hit a dead end and could never appear on the map at all.
//
// A field with one way to fill it is a field that becomes impossible rather
// than inconvenient. There are three ways now, and only one of them needs a
// permission.
const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

describe('a pasted coordinate pair is read the way people actually paste it', () => {
  it('takes what Google Maps copies', () => {
    expect(parseCoords('30.0444, 31.2357')).toEqual({ lat: 30.0444, lng: 31.2357 });
    expect(parseCoords('30.0444,31.2357')).toEqual({ lat: 30.0444, lng: 31.2357 });
    expect(parseCoords('30.0444 31.2357')).toEqual({ lat: 30.0444, lng: 31.2357 });
  });

  it('takes the display form, with degrees and hemispheres', () => {
    expect(parseCoords('30.0444° N, 31.2357° E')).toEqual({ lat: 30.0444, lng: 31.2357 });
  });

  it('honours the hemisphere letters over the written sign', () => {
    // "31.23 W" is a WESTERN longitude even though nothing is negative — a
    // reader who trusted the digits alone would put the shop in Egypt instead
    // of the Atlantic.
    expect(parseCoords('30.04 N, 31.23 W')).toEqual({ lat: 30.04, lng: -31.23 });
    expect(parseCoords('1.29 S, 36.82 E')).toEqual({ lat: -1.29, lng: 36.82 });
  });

  it('accepts a pair written longitude-first when the letters say so', () => {
    expect(parseCoords('31.2357 E, 30.0444 N')).toEqual({ lat: 30.0444, lng: 31.2357 });
  });

  it('reads signed pairs', () => {
    expect(parseCoords('-1.2921, 36.8219')).toEqual({ lat: -1.2921, lng: 36.8219 });
  });

  it('reads Arabic-Indic digits, including the Arabic decimal mark', () => {
    // ٫ (U+066B) is the Arabic DECIMAL separator, not a comma. Treating it as a
    // comma would split one number into two and place the pin thirty degrees
    // away — in the sea, silently.
    expect(parseCoords('٣٠٫٠٤٤٤, ٣١٫٢٣٥٧')).toEqual({ lat: 30.0444, lng: 31.2357 });
  });
});

describe('it refuses rather than guesses', () => {
  // A wrong pin is worse than no pin: a customer walks to it.
  it.each([
    ['', 'empty'],
    ['Cairo', 'a place name'],
    ['30.0444', 'one number'],
    ['30.0444, 31.2357, 12', 'three numbers'],
    ['100, 30', 'latitude past the pole'],
    ['30, 200', 'longitude past the antimeridian'],
    ['30 N, 31 N', 'two of the same axis'],
    ['30.04 N, 31.23', 'only one hemisphere letter'],
  ])('rejects %s (%s)', (input) => {
    expect(parseCoords(input)).toBeNull();
  });

  it('rejects exactly 0,0 — Null Island', () => {
    // What an empty or unparsed field becomes when someone reaches for
    // Number(). No shop is there.
    expect(parseCoords('0, 0')).toBeNull();
    expect(parseCoords('0.0001, 0')).not.toBeNull();
  });

  it('round-trips through the display form', () => {
    const c = { lat: 30.044419, lng: 31.235712 };
    expect(parseCoords(formatCoords(c))).toEqual({ lat: 30.04442, lng: 31.23571 });
  });
});

describe('the pin has more than one way in', () => {
  const panel = strip(src('app/app/components/ListingPanel.tsx'));

  it('offers the map picker up front, not only after a failure', () => {
    // A fallback that appears only once something broke is a fallback most
    // people never discover.
    expect(panel).toContain('x.pickOnMap');
    expect(panel).toContain('PinPickerCard');
  });

  it('a refused permission opens the map instead of dead-ending', () => {
    const handler = panel.slice(panel.indexOf('PERMISSION_DENIED'));
    expect(handler.slice(0, 400)).toContain('setPicking(true)');
    expect(panel).toContain('x.geoUseMapInstead');
  });

  it('accepts pasted coordinates as a third way', () => {
    expect(panel).toContain('parseCoords');
    expect(panel).toContain('x.pasteCoords');
  });

  it('a half-typed paste never clears a pin already placed', () => {
    // The field is invalid on nearly every keystroke. Writing on each one would
    // wipe a pin the merchant just tapped onto the map above.
    expect(panel).toMatch(/if \(parsed\) setDraft/);
  });

  it('clearing the pin clears the box too', () => {
    // Otherwise the field keeps showing coordinates that are no longer on the
    // listing, which reads as the removal not having worked.
    expect(panel).toMatch(/lat: null, lng: null \}\); setCoordText\(''\)/);
  });
});

describe('the picker does not leak the searcher rule into the merchant rule', () => {
  const picker = strip(src('components/map/PinPicker.tsx'));

  it('never reads the device location', () => {
    // This is the MERCHANT publishing their own premises — the opposite party
    // from the searcher, whose position C-108 §6 says is never stored. The
    // picker must not quietly become a second geolocation call.
    expect(picker).not.toContain('geolocation');
  });

  it('centres wide when there is no pin, rather than on a guess', () => {
    // Dropping someone into the wrong city and letting them believe it is
    // right is worse than making them zoom.
    expect(picker).toMatch(/setView\(\[20, 10\], 2\)/);
  });
});
