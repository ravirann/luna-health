'use client';

const SVG_PROPS = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function MicIcon() {
  return (
    <svg {...SVG_PROPS}>
      <rect x={9} y={3} width={6} height={12} rx={3} />
      <path d="M5 11v1a7 7 0 0 0 14 0v-1" />
      <path d="M12 19v3" />
    </svg>
  );
}

export function MuteIcon({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg {...SVG_PROPS}>
        <line x1={4} y1={4} x2={20} y2={20} />
        <rect x={9} y={3} width={6} height={12} rx={3} />
        <path d="M5 11v1a7 7 0 0 0 10.5 6" />
      </svg>
    );
  }
  return (
    <svg {...SVG_PROPS}>
      <rect x={9} y={3} width={6} height={12} rx={3} />
      <path d="M5 11v1a7 7 0 0 0 14 0v-1" />
    </svg>
  );
}

export function HangupIcon() {
  return (
    <svg {...SVG_PROPS} transform="rotate(135)">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.18 4.18 2 2 0 0 1 4.17 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.8a2 2 0 0 1-.45 2.11L8 10a16 16 0 0 0 6 6l1.37-1.37a2 2 0 0 1 2.11-.45c.9.35 1.84.59 2.8.72A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

// Plain X for the Luna close button — visually quieter than the rotated phone.
export function CloseIcon() {
  return (
    <svg {...SVG_PROPS} strokeWidth={1.8}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

// Heart — sits in the call top bar; opens "Memories".
export function HeartIcon() {
  return (
    <svg {...SVG_PROPS} fill="currentColor" stroke="none">
      <path d="M12 21s-7-4.5-9.5-9A5 5 0 0112 6a5 5 0 019.5 6c-2.5 4.5-9.5 9-9.5 9z" />
    </svg>
  );
}

// Profile — small avatar glyph used in the call topbar to take you home.
export function ProfileIcon() {
  return (
    <svg {...SVG_PROPS} strokeWidth={1.6}>
      <circle cx={12} cy={8} r={3.6} />
      <path d="M4.5 19c1.7-3.4 4.5-5 7.5-5s5.8 1.6 7.5 5" />
    </svg>
  );
}

// Cog — settings entry from the call surface.
export function CogIcon() {
  return (
    <svg {...SVG_PROPS} strokeWidth={1.5}>
      <circle cx={12} cy={12} r={3} />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 012.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 012.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </svg>
  );
}
