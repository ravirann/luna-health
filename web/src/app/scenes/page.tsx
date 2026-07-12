'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopNav } from '@/components/top-nav';
import { SCENES } from '@/lib/data';

export default function ScenesPage() {
  const router = useRouter();
  const [customSeed, setCustomSeed] = useState('');

  return (
    <main className="screen fade-in">
      <TopNav />
      <section className="scenes-screen">
        <header>
          <div>
            <div className="num-index">Pick a space</div>
            <h2>
              How do you want this to <em>feel</em> tonight?
            </h2>
          </div>
          <p>
            Pick something gentle. Or write your own — I’ll meet you there.
          </p>
        </header>

        <div className="scene-grid">
          {SCENES.map((s) =>
            s.custom ? (
              <div
                key={s.id}
                className="scene-card"
                style={{ ['--scene-hue' as string]: s.hue, cursor: 'default', gap: 10 }}
              >
                <div className="mini-orb" />
                <h3>{s.title}</h3>
                <div className="sub">{s.sub}</div>
                <textarea
                  value={customSeed}
                  onChange={(e) => setCustomSeed(e.target.value)}
                  placeholder="What's on your mind tonight?"
                  style={{
                    width: '100%',
                    minHeight: 64,
                    border: '0.5px solid var(--glass-hair)',
                    background: 'rgba(255,255,255,0.4)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 14,
                    color: 'var(--ink)',
                    resize: 'vertical',
                    outline: 'none',
                  }}
                />
                <div className="foot" style={{ marginTop: 6 }}>
                  <button
                    className="btn-primary"
                    style={{ padding: '10px 18px', fontSize: 13 }}
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        sessionStorage.setItem('luna:custom-seed', customSeed);
                      }
                      router.push('/call?scene=custom');
                    }}
                  >
                    Start talking
                  </button>
                </div>
              </div>
            ) : (
              <Link
                key={s.id}
                href={`/call?scene=${s.id}`}
                className="scene-card"
                style={{ ['--scene-hue' as string]: s.hue }}
              >
                <div className="mini-orb" />
                <h3>{s.title}</h3>
                <div className="sub">{s.sub}</div>
                <div className="foot">
                  <span>{s.hours}</span>
                </div>
              </Link>
            ),
          )}
        </div>
      </section>
    </main>
  );
}
