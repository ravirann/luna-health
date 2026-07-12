import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function ruleFor(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  return matches.at(-1)?.[1] ?? '';
}

describe('UI resilience CSS', () => {
  it('keeps primary icon and memory actions at accessible touch sizes', () => {
    expect(ruleFor('.nav-icon,\n.theme-toggle')).toContain('width: 44px');
    expect(ruleFor('.nav-icon,\n.theme-toggle')).toContain('height: 44px');
    expect(ruleFor('.icon-btn')).toContain('width: 44px');
    expect(ruleFor('.icon-btn')).toContain('height: 44px');
    expect(ruleFor('.memory-strip__act')).toContain('min-height: 44px');
  });

  it('disables decorative motion when reduced motion is requested', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('.orb-core');
    expect(css).toContain('.wave i');
    expect(css).toContain('.soft-gate-overlay');
    expect(css).toContain('.memory-strip__modal');
    expect(css).toContain('animation: none !important');
  });

  it('moves remaining one-off layout styles into CSS classes', () => {
    const files = [
      'src/app/onboarding/page.tsx',
      'src/components/luna-conversation.tsx',
      'src/components/preferences-panel.tsx',
      'src/components/top-nav.tsx',
    ];

    for (const file of files) {
      expect(source(file), `${file} should not use inline style props`).not.toContain('style={{');
    }
  });
});
