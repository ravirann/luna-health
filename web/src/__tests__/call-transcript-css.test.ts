import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

function selectorIndex(selector: string) {
  const matches = [...css.matchAll(new RegExp(`(^|\\n)${selector.replaceAll('.', '\\.')}\\s*\\{`, 'g'))];
  return matches.at(-1)?.index ?? -1;
}

describe('call transcript CSS', () => {
  it('keeps call transcript bubble rules after generic transcript rules', () => {
    const genericRows = selectorIndex('.live-transcript .tr-row');
    const callRows = selectorIndex('.call-transcript .live-transcript .tr-row');
    const callUserBubble = selectorIndex('.call-transcript .live-transcript .tr-you');

    expect(genericRows).toBeGreaterThan(-1);
    expect(callRows).toBeGreaterThan(genericRows);
    expect(callUserBubble).toBeGreaterThan(genericRows);
  });

  it('defines phase-driven voice acknowledgement motion on the call surface', () => {
    expect(css).toContain('.call-stage[data-phase="user-speaking"]');
    expect(css).toContain('.call-stage[data-phase="assistant-thinking"]');
    expect(css).toContain('.call-stage[data-phase="assistant-speaking"]');
    expect(css).toContain('.call-action--mic.is-user-speaking');
  });
});
