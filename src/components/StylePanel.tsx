'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { FONT_FAMILIES, hasDevanagari, weightsOf } from '@/engine/fonts';
import { buildCaptions } from '@/engine/group';
import { renderThumbnails } from '@/engine/thumbnails';
import { captionEnd, captionStart, type FontWeightName, type Style } from '@/engine/types';
import { tokenText } from '@/lib/project';
import { resolveStyle, useEditor } from '@/state/editor';
import { FixPanel } from './FixPanel';
import { TemplateGallery } from './TemplateGallery';

const TABS = [
  { id: 'style', label: 'Style', icon: 'palette' },
  { id: 'adjust', label: 'Adjust', icon: 'sliders' },
  { id: 'block', label: 'Block', icon: 'layers' },
  { id: 'word', label: 'Word', icon: 'type' },
  { id: 'review', label: 'Review', icon: 'sparkles' },
] as const;

const opaque = (color: string) => color.slice(0, 7);

function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  unit = '',
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="field slider-field">
      <div className="slider-label-row">
        <span>{label}</span>
        <span className="slider-val-badge">
          {value}
          {unit}
        </span>
      </div>
      <div className="pair">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </label>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field color-field">
      <span className="color-label">{label}</span>
      <div className="color-picker-wrap">
        <span className="color-preview-dot" style={{ backgroundColor: opaque(value) }} />
        <span className="color-hex-text">{value.toUpperCase()}</span>
        <input type="color" value={opaque(value)} onChange={(e) => onChange(e.target.value)} />
      </div>
    </label>
  );
}

function WordControls() {
  const doc = useEditor((s) => s.doc);
  const selected = useEditor((s) => s.selectedToken);
  const { setWordStyle } = useEditor.getState();
  const token = doc?.tokens.find((t) => t.id === selected);

  if (!doc || !token) return <p className="hint">Click a word in the preview, or in the caption being played, to give it its own look.</p>;
  const style = token.style ?? {};
  const base = resolveStyle(doc);

  return (
    <>
      <div className="section-label">{tokenText(token, doc.script)}</div>
      <Color label="Colour" value={style.color ?? base.activeColor} onChange={(color) => setWordStyle(token.id, { color }, 'word-color')} />
      <label className="field">
        Font
        <select
          value={style.fontFamily ?? ''}
          onChange={(e) => {
            const family = e.target.value;
            const weights = weightsOf(family);
            setWordStyle(token.id, family ? { fontFamily: family, fontWeight: weights[weights.length - 1] } : { fontFamily: undefined, fontWeight: undefined });
          }}
        >
          <option value="">Same as caption</option>
          {FONT_FAMILIES.map((family) => (
            <option key={family} value={family}>
              {family}
              {hasDevanagari(family) ? ' (हिन्दी)' : ''}
            </option>
          ))}
        </select>
      </label>
      <Slider label="Size %" min={50} max={250} step={5} value={Math.round((style.scale ?? 1) * 100)} onChange={(v) => setWordStyle(token.id, { scale: v / 100 }, 'word-size')} />
      <button disabled={!token.style} onClick={() => setWordStyle(token.id, null)}>
        Reset this word
      </button>
    </>
  );
}

function BlockControls({ seek }: { seek: (t: number) => void }) {
  const doc = useEditor((s) => s.doc);
  const selectedCaption = useEditor((s) => s.selectedCaption);
  const { selectCaption, setCaptionStyle } = useEditor.getState();

  if (!doc) return null;
  const captions = buildCaptions(doc);
  if (!captions.length) return <p className="hint">No captions available in this project.</p>;

  const selected = captions.find((c) => c.id === selectedCaption) ?? captions[0];
  const blockIndex = captions.findIndex((c) => c.id === selected.id) + 1;
  const blockStyle = doc.captionStyles?.[selected.id] ?? {};
  const base = resolveStyle(doc);
  const fullText = selected.words.map((w) => w.text).join(' ');
  const startTime = captionStart(selected);
  const endTime = captionEnd(selected);

  return (
    <div className="block-inspector">
      {/* Block Selector */}
      <label className="field block-selector-field">
        <span className="field-title">Select Block</span>
        <select
          value={selected.id}
          onChange={(e) => {
            selectCaption(e.target.value);
            const targetCap = captions.find((c) => c.id === e.target.value);
            if (targetCap) seek(captionStart(targetCap) + 0.001);
          }}
          className="block-select-dropdown"
        >
          {captions.map((c, i) => (
            <option key={c.id} value={c.id}>
              Block {i + 1}: &quot;{c.words.map((w) => w.text).join(' ').slice(0, 26)}&quot;
              {doc.captionStyles?.[c.id] ? ' ★ (Customized)' : ''}
            </option>
          ))}
        </select>
      </label>

      {/* Selected Block Info Card */}
      <div className="block-meta-card">
        <div className="block-meta-header">
          <span className="block-number-badge">BLOCK {blockIndex} OF {captions.length}</span>
          <button
            type="button"
            className="block-jump-btn"
            onClick={() => seek(startTime + 0.001)}
            title="Click to jump playhead here"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>{startTime.toFixed(2)}s – {endTime.toFixed(2)}s</span>
          </button>
        </div>
        <p className="block-text-preview">&ldquo;{fullText}&rdquo;</p>
      </div>

      {/* Feature 1: Behind The Person (Strictly for this block!) */}
      <div className="block-section">
        <div className="section-title">Cutout & Layering</div>
        <label className="block-toggle-row">
          <div className="toggle-info">
            <span className="toggle-title">Behind Person Cutout</span>
            <small className="toggle-desc">
              Sirf yeh Block {blockIndex} speaker ke peeche se guzrega. Baaki blocks normal rahenge.
            </small>
          </div>
          <input
            type="checkbox"
            checked={!!blockStyle.behindPerson}
            onChange={(e) =>
              setCaptionStyle(selected.id, { behindPerson: e.target.checked }, 'block-behind')
            }
          />
        </label>
        {blockStyle.behindPerson && (
          <div className="block-active-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Behind Person active strictly for Block {blockIndex}</span>
          </div>
        )}
      </div>

      {/* Feature 2: Custom Position (Per-Block!) */}
      <div className="block-section">
        <div className="section-title">Vertical Position for this Block</div>
        <div className="position-preset-grid">
          <button
            type="button"
            className={`preset-btn ${(blockStyle.anchorY ?? base.anchorY) <= 0.25 ? 'on' : ''}`}
            onClick={() => setCaptionStyle(selected.id, { anchorY: 0.15 }, 'block-y')}
          >
            Top (15%)
          </button>
          <button
            type="button"
            className={`preset-btn ${Math.abs((blockStyle.anchorY ?? base.anchorY) - 0.5) < 0.1 ? 'on' : ''}`}
            onClick={() => setCaptionStyle(selected.id, { anchorY: 0.50 }, 'block-y')}
          >
            Middle (50%)
          </button>
          <button
            type="button"
            className={`preset-btn ${(blockStyle.anchorY ?? base.anchorY) >= 0.70 ? 'on' : ''}`}
            onClick={() => setCaptionStyle(selected.id, { anchorY: 0.80 }, 'block-y')}
          >
            Bottom (80%)
          </button>
        </div>

        <Slider
          label="Custom Height"
          min={5}
          max={95}
          unit="%"
          value={Math.round((blockStyle.anchorY ?? base.anchorY) * 100)}
          onChange={(v) => setCaptionStyle(selected.id, { anchorY: v / 100 }, 'block-y')}
        />
      </div>

      {/* Feature 3: Custom Styling (Per-Block!) */}
      <div className="block-section">
        <div className="section-title">Colors & Typography for this Block</div>
        <Color
          label="Text Color"
          value={blockStyle.color ?? base.color}
          onChange={(color) => setCaptionStyle(selected.id, { color }, 'block-color')}
        />
        <Color
          label="Spoken Word Highlight"
          value={blockStyle.activeColor ?? base.activeColor}
          onChange={(activeColor) => setCaptionStyle(selected.id, { activeColor }, 'block-active-color')}
        />

        <label className="field">
          Font Family
          <select
            value={blockStyle.fontFamily ?? ''}
            onChange={(e) => {
              const family = e.target.value;
              const weights = weightsOf(family);
              setCaptionStyle(
                selected.id,
                family ? { fontFamily: family, fontWeight: weights[weights.length - 1] } : { fontFamily: undefined, fontWeight: undefined },
                'block-font'
              );
            }}
          >
            <option value="">Same as Template ({base.fontFamily})</option>
            {FONT_FAMILIES.map((family) => (
              <option key={family} value={family}>
                {family} {hasDevanagari(family) ? ' (हिन्दी)' : ''}
              </option>
            ))}
          </select>
        </label>

        <Slider
          label="Font Size"
          min={30}
          max={220}
          unit="px"
          value={blockStyle.fontSize ?? base.fontSize}
          onChange={(fontSize) => setCaptionStyle(selected.id, { fontSize }, 'block-size')}
        />
      </div>

      {/* Reset Block */}
      <div className="block-reset-wrap">
        <button
          type="button"
          disabled={!doc.captionStyles?.[selected.id]}
          onClick={() => setCaptionStyle(selected.id, null)}
          className="ghost block-reset-btn"
        >
          Reset Block {blockIndex} to Default Template
        </button>
      </div>
    </div>
  );
}

function Group({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="group" open={open}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

export function StylePanel({ seek }: { seek: (t: number) => void }) {
  const doc = useEditor((s) => s.doc);
  const selected = useEditor((s) => s.selectedToken);
  const selectedCaption = useEditor((s) => s.selectedCaption);
  const { setStyle, setMaxWords, setOffset } = useEditor.getState();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('style');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const script = doc?.script;

  useEffect(() => {
    if (selectedCaption) setTab('block');
  }, [selectedCaption]);

  useEffect(() => {
    if (selected) setTab('word');
  }, [selected]);

  useEffect(() => {
    renderThumbnails(script === 'hindi' ? 'devanagari' : 'latin').then(setThumbs);
  }, [script]);

  if (!doc) return null;
  const style = resolveStyle(doc);
  const set = (key: string) => (partial: Parameters<typeof setStyle>[0]) => setStyle(partial, key);

  return (
    <aside className="style">
      <div className="tabs style-panel-tabs" role="tablist">
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`tab-btn ${tab === id ? 'on' : ''}`}
            onClick={() => setTab(id)}
          >
            {icon === 'palette' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
                <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
                <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
                <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.992 6.445 17.555 2 12 2z"/>
              </svg>
            )}
            {icon === 'sliders' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="21" x2="4" y2="14"/>
                <line x1="4" y1="10" x2="4" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12" y2="3"/>
                <line x1="20" y1="21" x2="20" y2="16"/>
                <line x1="20" y1="12" x2="20" y2="3"/>
                <line x1="1" y1="14" x2="7" y2="14"/>
                <line x1="9" y1="8" x2="15" y2="8"/>
                <line x1="17" y1="16" x2="23" y2="16"/>
              </svg>
            )}
            {icon === 'layers' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            )}
            {icon === 'type' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="4 7 4 4 20 4 20 7"/>
                <line x1="9" y1="20" x2="15" y2="20"/>
                <line x1="12" y1="4" x2="12" y2="20"/>
              </svg>
            )}
            {icon === 'sparkles' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/>
              </svg>
            )}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {tab === 'style' ? (
        <TemplateGallery thumbs={thumbs} />
      ) : tab === 'review' ? (
        <FixPanel seek={seek} />
      ) : tab === 'block' ? (
        <div className="tab-body">
          <BlockControls seek={seek} />
        </div>
      ) : tab === 'word' ? (
        <div className="tab-body">
          <WordControls />
        </div>
      ) : (
        <div className="tab-body">
          <Group title="Font" open>
          <label className="field">
            Family
            <select
              value={style.fontFamily}
              onChange={(e) => {
                const family = e.target.value;
                const weights = weightsOf(family);
                setStyle({ fontFamily: family, fontWeight: weights[weights.length - 1] });
              }}
            >
              {FONT_FAMILIES.map((family) => (
                <option key={family} value={family}>
                  {family}
                  {hasDevanagari(family) ? ' (हिन्दी)' : ''}
                </option>
              ))}
            </select>
          </label>
          {weightsOf(style.fontFamily).length > 1 && (
            <label className="field">
              Weight
              <select value={style.fontWeight} onChange={(e) => setStyle({ fontWeight: e.target.value as FontWeightName })}>
                {weightsOf(style.fontFamily).map((weight) => (
                  <option key={weight}>{weight}</option>
                ))}
              </select>
            </label>
          )}
          <Slider label="Size" min={30} max={220} value={style.fontSize} onChange={(fontSize) => set('size')({ fontSize })} />
          <Slider label="Letter gap" min={-4} max={20} value={style.letterSpacing} onChange={(letterSpacing) => set('spacing')({ letterSpacing })} />
          <label className="field">
            Capitals
            <input type="checkbox" checked={style.uppercase} onChange={(e) => setStyle({ uppercase: e.target.checked })} />
          </label>
          </Group>

          <Group title="Colour" open>
          <Color label="Text" value={style.color} onChange={(color) => set('color')({ color })} />
          <Color label="Spoken word" value={style.activeColor} onChange={(activeColor) => set('active')({ activeColor })} />
          {style.highlight === 'pill' && <Color label="Box" value={style.pillColor} onChange={(pillColor) => set('pill')({ pillColor })} />}
          </Group>

          <Group title="Outline and shadow">
          <Slider
            label="Outline"
            min={0}
            max={30}
            value={style.stroke?.width ?? 0}
            onChange={(width) => set('stroke')({ stroke: width ? { color: style.stroke?.color ?? '#000000', width } : null })}
          />
          {style.stroke && (
            <Color label="Outline colour" value={style.stroke.color} onChange={(color) => set('stroke-color')({ stroke: { ...style.stroke!, color } })} />
          )}
          <Slider
            label="Shadow"
            min={0}
            max={50}
            value={style.shadow?.blur ?? 0}
            onChange={(blur) => set('shadow')({ shadow: blur ? { color: style.shadow?.color ?? '#000000AA', offsetY: style.shadow?.offsetY ?? 6, blur } : null })}
          />
          </Group>

          <Group title="Effects">
          <label className="field">
            Shine
            <input type="checkbox" checked={style.shine} onChange={(e) => setStyle({ shine: e.target.checked })} />
          </label>
          <label className="field">
            Blend
            <select value={style.blend} onChange={(e) => setStyle({ blend: e.target.value as Style['blend'] })}>
              <option value="normal">Normal</option>
              <option value="overlay">Overlay</option>
              <option value="screen">Screen</option>
              <option value="soft-light">Soft light</option>
            </select>
          </label>
          </Group>

          <Group title="Position and timing" open>
          <Slider label="Height" min={5} max={95} value={Math.round(style.anchorY * 100)} onChange={(v) => set('position')({ anchorY: v / 100 })} />
          <Slider label="Words each" min={1} max={8} value={doc.maxWords} onChange={setMaxWords} />
          <Slider label="Delay (ms)" min={-500} max={500} step={10} value={Math.round(doc.offset * 1000)} onChange={(v) => setOffset(v / 1000)} />
          </Group>
        </div>
      )}
    </aside>
  );
}
