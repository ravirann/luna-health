import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

// Pure Node file walk — CI runners don't have ripgrep on PATH.
function listFiles(root: string, dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(root, full);
    return entry.isFile() ? [relative(root, full)] : [];
  });
}

describe('release naming', () => {
  it('does not ship legacy product identifiers in app source', () => {
    const root = process.cwd();
    const files = ['src', 'public', 'drizzle']
      .flatMap((top) => listFiles(root, join(root, top)))
      .filter((file) => !/\.test\.tsx?$/.test(file));

    // Names joined from fragments so this file never matches itself.
    const legacyNames = [
      new RegExp(['saa', 'thi'].join(''), 'i'),
      new RegExp(['lun', 'ify'].join(''), 'i'),
    ];
    const offenders = files.filter((file) => {
      const text = readFileSync(join(root, file), 'utf8');
      return legacyNames.some((pattern) => pattern.test(text));
    });

    expect(offenders).toEqual([]);
  });
});
