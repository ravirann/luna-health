import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Instrument_Serif, Geist, Tiro_Devanagari_Hindi } from 'next/font/google';
import { readBrandFromEnv } from '@/lib/brand';
import './globals.css';

// Read the persisted mood from localStorage and mirror it onto
// <html data-mood> BEFORE first paint, so the palette is correct
// without a flash of the default. Mood is intentionally local-only —
// it changes the UI palette and shouldn't round-trip through the bot.
const MOOD_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('luna:mood');if(m!=='blue'&&m!=='rose'&&m!=='purple'&&m!=='amber')m='blue';document.documentElement.setAttribute('data-mood',m);}catch(e){document.documentElement.setAttribute('data-mood','blue');}})();`;

const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  display: 'swap',
});

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
  display: 'swap',
});

const tiroDevanagari = Tiro_Devanagari_Hindi({
  variable: '--font-tiro-devanagari',
  weight: '400',
  subsets: ['devanagari'],
  display: 'swap',
});

function metadataBaseUrl(): URL {
  const explicit = (process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (explicit) return new URL(explicit);
  const vercelUrl = (process.env.VERCEL_URL || '').trim();
  if (vercelUrl) return new URL(`https://${vercelUrl}`);
  return new URL('http://localhost:3000');
}

// Metadata is generated at request time so changing BRAND_NAME / TAGLINE
// in env updates the page title without a redeploy.
export function generateMetadata(): Metadata {
  const brand = readBrandFromEnv();
  const cap = brand.brandName.charAt(0).toUpperCase() + brand.brandName.slice(1);
  return {
    metadataBase: metadataBaseUrl(),
    title: `${cap} — ${brand.tagline}`,
    description:
      'A voice companion for late-night conversations. No judgment. No agenda.',
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [
        { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
        { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
        { url: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
        { url: '/favicon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/favicon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [
        { url: '/app-icon/ios/icon-180.png', sizes: '180x180' },
        { url: '/app-icon/ios/icon-167.png', sizes: '167x167' },
        { url: '/app-icon/ios/icon-152.png', sizes: '152x152' },
        { url: '/app-icon/ios/icon-120.png', sizes: '120x120' },
      ],
    },
    appleWebApp: {
      capable: true,
      title: cap,
      statusBarStyle: 'black-translucent',
      startupImage: [
        { url: '/splash/splash-iphone-1290x2796.png', media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)' },
        { url: '/splash/splash-iphone-1179x2556.png', media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)' },
        { url: '/splash/splash-iphone-1170x2532.png', media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)' },
        { url: '/splash/splash-iphone-1080x1920.png', media: '(device-width: 360px) and (device-height: 640px) and (-webkit-device-pixel-ratio: 3)' },
        { url: '/splash/splash-ipad-2048x2732.png', media: '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)' },
      ],
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#0d0220',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-mood="blue"
      className={`${instrumentSerif.variable} ${geist.variable} ${tiroDevanagari.variable}`}
      suppressHydrationWarning
    >
      <body className="luna stage-bg" suppressHydrationWarning>
        <Script id="luna-mood-init" strategy="beforeInteractive">
          {MOOD_INIT_SCRIPT}
        </Script>
        <div className="stage-glow" aria-hidden />
        <div className="stage-noise" aria-hidden />
        {children}
        {/* Bot audio track is mounted here by the pipecat client on
            `TrackStarted`. Lives in the layout so it survives nav. */}
        <audio id="assistant-audio" autoPlay playsInline />
      </body>
    </html>
  );
}
