import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The band is as tall as the words inside it.
//
// Its subtitle was a four-line paragraph that restated the platform boundary —
// which the note at the BOTTOM of the same screen already says, at more length
// and in the right place. The band paid for that twice: once in height, and
// once by pushing the first result below the fold.
const dir = join(process.cwd(), 'src/lib/i18n');
const locales = readdirSync(dir).filter((f) => /^[a-z]{2}\.ts$/.test(f));
const read = (f: string) => readFileSync(join(dir, f), 'utf8');

describe('the band says one short thing', () => {
  it('covers every locale', () => {
    expect(locales.length).toBe(12);
  });

  it.each(locales)('%s keeps the subtitle to one line', (f) => {
    const m = read(f).match(/\n\s*subtitle:\s*'((?:[^'\\]|\\.)*)'/);
    expect(m).not.toBeNull();
    // 60 characters is roughly one line on a phone. The old English string was
    // 174 and wrapped to four.
    expect(m![1]!.length).toBeLessThanOrEqual(60);
  });

  it.each(locales)('%s does not restate the boundary in the band', (f) => {
    const m = read(f).match(/\n\s*subtitle:\s*'((?:[^'\\]|\\.)*)'/);
    // Naming another runtime up there is the shape of the paragraph that was
    // removed — the boundary belongs in `boundaryNote`, at the bottom.
    expect(m![1]!).not.toMatch(/Connection|Zone/);
  });
});

describe('the boundary is stated once, from the dictionary', () => {
  it.each(locales)('%s has a boundaryNote', (f) => {
    expect(read(f)).toContain('boundaryNote:');
  });

  it('the page renders it from i18n, not as literal English', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/app/page.tsx'), 'utf8');
    expect(page).toContain('t.explorer.boundaryNote');
    expect(page).not.toContain('Explorer helps you discover public');
  });
});

describe('verification is attributed to Zone, not KYC', () => {
  // C-108, corrected 2026-09-02: KYC verifies a PERSON; a listing is an ENTITY,
  // and entity verification is Zone's. The app was still telling every visitor
  // the badge comes from KYC.
  it.each(locales)('%s never credits KYC for a business badge', (f) => {
    expect(read(f)).not.toMatch(/\bKYC\b/);
  });
});
