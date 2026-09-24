import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// C-123 §2: every session cookie is `Secure; SameSite=None; Partitioned`. A cookie set
// with SameSite=None but WITHOUT Partitioned is a different cookie in an embedded Pi
// Browser context — a second copy of the token in another jar, so the next read can see
// the old one. resolve-incomplete re-set tec_access_token that way in the template and
// every app cloned from it; the weekly KB drift job (tec-knowledge-base
// scripts/check-drift.py) found it. This pins it per app, object by object.

function sources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

const code = (file: string) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line)) // comments may quote the old form
    .join('\n');

const files = () => [...sources('src'), 'middleware.ts'].filter(existsSync);

describe('session cookies (C-123 §2)', () => {
  it('every sameSite none cookie object is also partitioned', () => {
    const offenders: string[] = [];
    for (const file of files()) {
      for (const obj of code(file).match(/\{[^{}]*sameSite\s*:\s*['"]none['"][^{}]*\}/gi) ?? []) {
        if (!/partitioned\s*:\s*true/.test(obj)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no cookie is sameSite lax', () => {
    const lax = files().filter((file) => /sameSite\s*:\s*['"]lax['"]/i.test(code(file)));
    expect(lax).toEqual([]);
  });
});
