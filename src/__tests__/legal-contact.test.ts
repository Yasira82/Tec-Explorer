/**
 * The legal pages must name the real operator and an address that answers.
 *
 * Until 16 Nov 2026 they said "The Elite Consortium" (owner: the operator is TEC) and gave
 * privacy@tec.pi / support@tec.pi — `.pi` resolves only inside Pi Browser, so no mail sent
 * there was ever delivered, on pages that promise a reply.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTACT_EMAIL, CONTACT_PHONE } from '../lib/contact';

const page = (p: string) => readFileSync(join(__dirname, '..', 'app', p, 'page.tsx'), 'utf8');

describe.each(['privacy', 'terms'])('/%s', (p) => {
  it('gives no .pi mail address — none is deliverable', () => {
    expect(page(p)).not.toMatch(/[\w.]+@[\w-]+\.pi\b/);
  });
  it('names TEC, not "The Elite Consortium"', () => {
    expect(page(p)).not.toMatch(/Consortium/);
  });
  it('links the contact address and phone', () => {
    expect(page(p)).toContain('mailto:${CONTACT_EMAIL}');
    expect(page(p)).toContain('tel:${CONTACT_PHONE}');
  });
});

describe('contact', () => {
  it('is a deliverable email and an international phone number', () => {
    expect(CONTACT_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/);
    expect(CONTACT_EMAIL.endsWith('.pi')).toBe(false);
    expect(CONTACT_PHONE).toMatch(/^\+\d{8,15}$/);
  });
});
