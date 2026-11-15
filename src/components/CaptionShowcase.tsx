'use client';

import { useState, useEffect } from 'react';

interface StyleDemo {
  id: string;
  name: string;
  creator: string;
  badge: string;
  badgeColor: string;
  words: { text: string; active?: boolean; highlight?: boolean }[];
  styleClass: string;
  font: string;
}

const STYLES: StyleDemo[] = [
  {
    id: 'pop-viral',
    name: 'Pop Viral',
    creator: 'MrBeast Style',
    badge: 'Trending 🔥',
    badgeColor: '#ef8557',
    words: [
      { text: 'THIS' },
      { text: 'CHANGES', active: true },
      { text: 'EVERYTHING' },
      { text: 'FOREVER' },
    ],
    styleClass: 'style-pop-viral',
    font: 'Poppins Black',
  },
  {
    id: 'hormozi-punch',
    name: 'Kinetic Punch',
    creator: 'Alex Hormozi Style',
    badge: 'High Engagement',
    badgeColor: '#10b981',
    words: [
      { text: 'YOU' },
      { text: 'MUST', highlight: true },
      { text: 'FOCUS', active: true },
      { text: 'DAILY' },
    ],
    styleClass: 'style-hormozi',
    font: 'Impact Bold',
  },
  {
    id: 'clean-minimal',
    name: 'Clean Studio',
    creator: 'Ali Abdaal Style',
    badge: 'Minimal & Crisp',
    badgeColor: '#3b82f6',
    words: [
      { text: 'the' },
      { text: 'secret', active: true },
      { text: 'to' },
      { text: 'consistency' },
    ],
    styleClass: 'style-clean',
    font: 'Inter Semibold',
  },
  {
    id: 'hindi-glow',
    name: 'Devanagari Glow',
    creator: 'Hindi & Hinglish',
    badge: 'Auto Ligatures 🇮🇳',
    badgeColor: '#a855f7',
    words: [
      { text: 'यह' },
      { text: 'वीडियो', active: true },
      { text: 'वायरल' },
      { text: 'होगी' },
    ],
    styleClass: 'style-devanagari',
    font: 'Rozha One / Poppins',
  },
];

export function CaptionShowcase() {
  const [activeWordIndex, setActiveWordIndex] = useState(1);

  // Dynamic cycle through active words to bring cards alive
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveWordIndex((prev) => (prev + 1) % 4);
    }, 1800);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="showcase-section">
      <div className="section-head">
        <div>
          <span className="badge-pill">PRESET STYLES</span>
          <h2 className="section-title">Trending Styles in One Click</h2>
        </div>
        <p className="section-desc">
          Professional kinetic typography rendered at 60 fps with 4K clarity. Frame-accurate timing guaranteed.
        </p>
      </div>

      <div className="showcase-grid">
        {STYLES.map((s) => (
          <div key={s.id} className="showcase-card">
            <div className="showcase-header">
              <span className="showcase-creator">{s.creator}</span>
              <span className="showcase-badge" style={{ backgroundColor: `${s.badgeColor}20`, color: s.badgeColor }}>
                {s.badge}
              </span>
            </div>

            <div className={`showcase-preview ${s.styleClass}`}>
              <div className="caption-box">
                {s.words.map((w, idx) => {
                  const isCurrent = idx === activeWordIndex;
                  return (
                    <span
                      key={idx}
                      className={`caption-word ${isCurrent ? 'active' : ''} ${w.highlight ? 'highlight' : ''}`}
                    >
                      {w.text}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="showcase-footer">
              <span className="showcase-name">{s.name}</span>
              <span className="showcase-font">{s.font}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
