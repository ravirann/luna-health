import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

describe('release naming', () => {
  it('does not ship legacy product identifiers in app source', () => {
    const root = process.cwd();
    const files = execFileSync('rg', [
      '--files',
      'src',
      'public',
      'drizzle',
      '-g',
      '!src/**/*.test.ts',
      '-g',
      '!src/**/*.test.tsx',
      '-g',
      '!src/__tests__/release-naming.test.ts',
    ], {
      cwd: root,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    const legacyName = new RegExp(['saa', 'thi'].join(''), 'i');
    const offenders = files.filter((file) => legacyName.test(readFileSync(join(root, file), 'utf8')));

    expect(offenders).toEqual([]);
  });
});
