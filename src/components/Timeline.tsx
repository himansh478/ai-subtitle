'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { playSfxSound, type SfxSoundType } from '@/engine/sfx';
import { captionEnd, captionStart, type Caption } from '@/engine/types';
import { resolveSfx, resolveStyle, useEditor } from '@/state/editor';
import { playhead } from '@/state/playhead';

const MIN_ZOOM = 20;
const MAX_ZOOM = 300;
const WAVE_HEIGHT = 40;
const MIN_LENGTH = 0.1;

const stamp = (t: number) => {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
};

type Drag = { id: string; mode: 'move' | 'left' | 'right'; x: number; start: number; end: number; min: number; max: number };
type Lasso = { x0: number; x1: number };

export function Timeline({ captions, seek }: { captions: Caption[]; seek: (t: number) => void }) {
  const project = useEditor((s) => s.project);
  const doc = useEditor((s) => s.doc);
  const selectedCaption = useEditor((s) => s.selectedCaption);
  const selectCaption = useEditor((s) => s.selectCaption);
  const retime = useEditor((s) => s.retimeCaption);
  const offset = useEditor((s) => s.doc?.offset ?? 0);
  const sfx = resolveSfx(doc);
  const setSfx = useEditor.getState().setSfx;
  const toggleSfxMute = useEditor.getState().toggleSfxMute;
  const setBulkCaptionSfx = useEditor.getState().setBulkCaptionSfx;
  const clearAllSfx = useEditor.getState().clearAllSfx;
  const enableAllSfx = useEditor.getState().enableAllSfx;
  const [zoom, setZoom] = useState(70);
  const [sfxManagerOpen, setSfxManagerOpen] = useState(false);
  const [activeWordInspectorId, setActiveWordInspectorId] = useState<string | null>(null);
  const [sfxSearch, setSfxSearch] = useState('');

  // ── Multi-select state ──────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lasso, setLasso] = useState<Lasso | null>(null);
  const lassoStartRef = useRef<number | null>(null);
  const lassoActiveRef = useRef(false);
  const timelineRef = useRef<HTMLElement>(null);

  const sfxCount = useMemo(() => {
    if (!sfx.enabled) return 0;
    const muted = new Set(sfx.mutedIds ?? []);
    if (sfx.trigger === 'word') {
      let count = 0;
      for (const c of captions) {
        if (muted.has(c.id)) continue;
        for (let i = 0; i < c.words.length; i++) {
          const w = c.words[i];
          const id = w.tokenId ?? `${c.id}:${w.text}:${i}`;
          if (!muted.has(id)) count++;
        }
      }
      return count;
    }
    return captions.filter((c) => !muted.has(c.id)).length;
  }, [captions, sfx.enabled, sfx.trigger, sfx.mutedIds]);

  // Refs, because a quick drag can move before React has re-rendered with the new state.
  const dragRef = useRef<Drag | null>(null);
  const movedRef = useRef<{ id: string; start: number; end: number } | null>(null);
  const [preview, setPreview] = useState<{ id: string; start: number; end: number } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const needleRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackInnerRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const scrubbingRef = useRef(false);

  const duration = project?.media.duration ?? 0;
  const width = Math.max(1, duration * zoom);

  // ── Bulk Position (Y and X) computation ─────────────────────────────────────
  const bulkY = useMemo(() => {
    if (selectedIds.size === 0 || !doc) return 0.5;
    const baseY = resolveStyle(doc).anchorY;
    let sum = 0;
    let count = 0;
    for (const id of selectedIds) {
      const override = doc.captionStyles?.[id];
      sum += override?.anchorY ?? baseY;
      count++;
    }
    return count > 0 ? sum / count : baseY;
  }, [selectedIds, doc]);

  const bulkX = useMemo(() => {
    if (selectedIds.size === 0 || !doc) return 0.5;
    const baseX = resolveStyle(doc).anchorX;
    let sum = 0;
    let count = 0;
    for (const id of selectedIds) {
      const override = doc.captionStyles?.[id];
      sum += override?.anchorX ?? baseX;
      count++;
    }
    return count > 0 ? sum / count : baseX;
  }, [selectedIds, doc]);

  const applyBulkY = (v: number) => {
    if (selectedIds.size === 0) return;
    useEditor.getState().setBulkCaptionStyle([...selectedIds], { anchorY: v }, 'bulk-y');
  };

  const applyBulkX = (v: number) => {
    if (selectedIds.size === 0) return;
    useEditor.getState().setBulkCaptionStyle([...selectedIds], { anchorX: v }, 'bulk-x');
  };

  const resetBulkPosition = () => {
    if (selectedIds.size === 0) return;
    useEditor.getState().setBulkCaptionStyle([...selectedIds], { anchorY: undefined, anchorX: undefined }, 'bulk-reset');
  };

  // ── Select All toggle ────────────────────────────────────────────────────────
  const toggleSelectAll = () => {
    if (selectedIds.size === captions.length && captions.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(captions.map((c) => c.id)));
    }
  };

  // Keyboard shortcut Ctrl+A / Cmd+A when timeline is hovered
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (/^(TEXTAREA|INPUT|SELECT)$/.test(target.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        if (el.contains(target) || el.matches(':hover')) {
          e.preventDefault();
          setSelectedIds(new Set(captions.map((c) => c.id)));
        }
      } else if (e.key === 'Escape' && selectedIds.size > 0) {
        setSelectedIds(new Set());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [captions, selectedIds.size]);

  useEffect(() => {
    const update = (time: number) => {
      if (needleRef.current) needleRef.current.style.left = `${time * zoom}px`;
      if (tooltipRef.current) tooltipRef.current.textContent = stamp(time);
      const scroller = scrollRef.current;
      if (scroller && !scrubbingRef.current) {
        const x = time * zoom;
        if (x < scroller.scrollLeft || x > scroller.scrollLeft + scroller.clientWidth - 40) {
          scroller.scrollLeft = x - 40;
        }
      }
      setActiveId(captions.find((c) => time >= captionStart(c) && time < captionEnd(c))?.id ?? null);
    };
    update(playhead.get());
    return playhead.subscribe(update);
  }, [zoom, captions]);

  useEffect(() => {
    const canvas = waveRef.current;
    if (!canvas || !project) return;
    canvas.width = width;
    canvas.height = WAVE_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#4b4e55';
    const { envelope } = project;
    const perPixel = envelope.length / width;
    for (let x = 0; x < width; x++) {
      const from = Math.floor(x * perPixel);
      const to = Math.max(from + 1, Math.floor((x + 1) * perPixel));
      let peak = -60;
      for (let i = from; i < to; i++) peak = Math.max(peak, envelope[i] ?? -60);
      const height = Math.max(1, ((peak + 60) / 60) * WAVE_HEIGHT);
      ctx.fillRect(x, (WAVE_HEIGHT - height) / 2, 1, height);
    }
  }, [project, width]);

  const updateScrub = (clientX: number) => {
    const inner = trackInnerRef.current;
    if (!inner) return;
    const box = inner.getBoundingClientRect();
    const time = Math.max(0, Math.min(duration, (clientX - box.left) / zoom));
    seek(time);

    // Auto-scroll timeline when dragging near edges
    const scroller = scrollRef.current;
    if (scroller) {
      const viewLeft = scroller.getBoundingClientRect().left;
      const viewRight = scroller.getBoundingClientRect().right;
      if (clientX > viewRight - 50) {
        scroller.scrollLeft += 12;
      } else if (clientX < viewLeft + 50) {
        scroller.scrollLeft -= 12;
      }
    }
  };

  const startScrub = (e: PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
    scrubbingRef.current = true;
    setScrubbing(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    updateScrub(e.clientX);
  };

  const moveScrub = (e: PointerEvent<HTMLElement>) => {
    if (!scrubbingRef.current) return;
    e.preventDefault();
    updateScrub(e.clientX);
  };

  const endScrub = (e: PointerEvent<HTMLElement>) => {
    if (scrubbingRef.current) {
      scrubbingRef.current = false;
      setScrubbing(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const begin = (e: PointerEvent<HTMLElement>, caption: Caption, index: number, mode: Drag['mode']) => {
    e.stopPropagation();
    e.preventDefault();
    const start = captionStart(caption);
    const end = caption.words[caption.words.length - 1].end;
    dragRef.current = {
      id: caption.id,
      mode,
      x: e.clientX,
      start,
      end,
      min: index > 0 ? captionEnd(captions[index - 1]) : 0,
      max: index < captions.length - 1 ? captionStart(captions[index + 1]) : duration,
    };
    (e.currentTarget.closest('.track-inner') as HTMLElement).setPointerCapture(e.pointerId);
  };

  const move = (e: PointerEvent<HTMLElement>) => {
    if (scrubbingRef.current) {
      updateScrub(e.clientX);
      return;
    }

    // Lasso drag update
    if (lassoActiveRef.current && lassoStartRef.current !== null) {
      const inner = trackInnerRef.current;
      const scroller = scrollRef.current;
      if (inner && scroller) {
        const box = inner.getBoundingClientRect();
        const x1 = e.clientX - box.left + scroller.scrollLeft;
        setLasso({ x0: lassoStartRef.current, x1 });
      }
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const delta = (e.clientX - drag.x) / zoom;
    let { start, end } = drag;
    if (drag.mode === 'move') {
      const shift = Math.min(drag.max - end, Math.max(drag.min - start, delta));
      start += shift;
      end += shift;
    } else if (drag.mode === 'left') {
      start = Math.min(end - MIN_LENGTH, Math.max(drag.min, start + delta));
    } else {
      end = Math.max(start + MIN_LENGTH, Math.min(drag.max, end + delta));
    }
    movedRef.current = { id: drag.id, start, end };
    setPreview(movedRef.current);
  };

  const finish = (e: PointerEvent<HTMLElement>) => {
    if (scrubbingRef.current) {
      endScrub(e);
      return;
    }

    // Lasso finish: select overlapping captions
    if (lassoActiveRef.current && lasso) {
      const lo = Math.min(lasso.x0, lasso.x1);
      const hi = Math.max(lasso.x0, lasso.x1);
      const dragged = Math.abs(lasso.x1 - lasso.x0) > 4;
      if (dragged) {
        const hits = new Set<string>();
        for (const caption of captions) {
          const shown = preview?.id === caption.id ? preview : { start: captionStart(caption), end: captionEnd(caption) };
          const capLeft = shown.start * zoom;
          const capRight = shown.end * zoom;
          if (capLeft < hi && capRight > lo) hits.add(caption.id);
        }
        setSelectedIds(hits);
      } else {
        // Single click on background — clear selection
        setSelectedIds(new Set());
      }
      lassoActiveRef.current = false;
      lassoStartRef.current = null;
      setLasso(null);
      return;
    }

    const drag = dragRef.current;
    const moved = movedRef.current;
    if (drag && moved) retime(moved.id, drag.start - offset, drag.end - offset, moved.start - offset, moved.end - offset);
    dragRef.current = null;
    movedRef.current = null;
    setPreview(null);
  };

  // ── Lasso starts on the caption-track background ────────────────────────────
  const startLasso = (e: PointerEvent<HTMLDivElement>) => {
    // Only on direct click of .caption-track, not on a child .block
    if ((e.target as HTMLElement).closest('.block')) return;
    e.stopPropagation();
    lassoActiveRef.current = true;
    const inner = trackInnerRef.current;
    const scroller = scrollRef.current;
    if (inner && scroller) {
      const box = inner.getBoundingClientRect();
      const x0 = e.clientX - box.left + scroller.scrollLeft;
      lassoStartRef.current = x0;
      setLasso({ x0, x1: x0 });
    }
    try {
      (e.currentTarget.closest('.track-inner') as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const seconds: number[] = [];
  const stepBy = zoom < 40 ? 5 : zoom < 100 ? 2 : 1;
  for (let s = 0; s < duration; s += stepBy) seconds.push(s);

  return (
    <section className="timeline" ref={timelineRef}>
      {/* ── Bulk Position Bar (Sleek, organized single-row toolbar) ── */}
      {selectedIds.size > 0 && (
        <div className="bulk-pos-bar" role="toolbar" aria-label="Bulk Subtitle Position & Sound Controls">
          <div className="bulk-badge-wrap">
            <span className="bulk-badge-pill">
              📌 {selectedIds.size === captions.length ? 'All Subtitles Selected' : `${selectedIds.size}/${captions.length} Selected`}
            </span>
          </div>

          {/* Quick Alignment Presets */}
          <div className="bulk-presets" title="Preset positions for selected subtitles">
            <button
              type="button"
              className={`bulk-preset-btn ${Math.abs(bulkY - 0.15) < 0.03 ? 'active' : ''}`}
              onClick={() => applyBulkY(0.15)}
              title="Move to Top (15%)"
            >
              <span>⬆</span> Top
            </button>
            <button
              type="button"
              className={`bulk-preset-btn ${Math.abs(bulkY - 0.5) < 0.03 ? 'active' : ''}`}
              onClick={() => applyBulkY(0.5)}
              title="Move to Center (50%)"
            >
              <span>⬍</span> Center
            </button>
            <button
              type="button"
              className={`bulk-preset-btn ${Math.abs(bulkY - 0.8) < 0.03 ? 'active' : ''}`}
              onClick={() => applyBulkY(0.8)}
              title="Move to Bottom (80%)"
            >
              <span>⬇</span> Bottom
            </button>
          </div>

          <div className="bulk-divider" />

          {/* Compact Position Sliders */}
          <div className="bulk-slider-group">
            <label className="bulk-pos-label" title="Vertical Height (Y%)">
              <span className="bulk-axis-tag">Y</span>
              <input
                type="range"
                min={5}
                max={95}
                step={1}
                value={Math.round(bulkY * 100)}
                onChange={(e) => applyBulkY(Number(e.target.value) / 100)}
              />
              <span className="bulk-pos-val">{Math.round(bulkY * 100)}%</span>
            </label>

            <label className="bulk-pos-label" title="Horizontal Center (X%)">
              <span className="bulk-axis-tag">X</span>
              <input
                type="range"
                min={10}
                max={90}
                step={1}
                value={Math.round(bulkX * 100)}
                onChange={(e) => applyBulkX(Number(e.target.value) / 100)}
              />
              <span className="bulk-pos-val">{Math.round(bulkX * 100)}%</span>
            </label>
          </div>

          <div className="bulk-divider" />

          {/* Bulk SFX Actions (Apply/Remove SFX on selected subtitles) */}
          <div className="bulk-sfx-group" title="Manage Typing SFX on selected subtitles">
            <button
              type="button"
              className="bulk-sfx-btn on"
              onClick={() => setBulkCaptionSfx([...selectedIds], true)}
              title="Apply Typing SFX to all selected subtitles"
            >
              <span className="sfx-icon">⌨</span>
              <span>Apply SFX</span>
            </button>
            <button
              type="button"
              className="bulk-sfx-btn mute"
              onClick={() => setBulkCaptionSfx([...selectedIds], false)}
              title="Delete / Remove Typing SFX from all selected subtitles"
            >
              <span className="sfx-icon">🔇</span>
              <span>Remove SFX</span>
            </button>
          </div>

          {/* Reset & Deselect Buttons */}
          <div className="bulk-actions">
            <button
              type="button"
              className="bulk-action-btn"
              onClick={resetBulkPosition}
              title="Reset position overrides back to default"
            >
              ↺ Reset
            </button>
            <button
              type="button"
              className="bulk-action-btn bulk-pos-clear"
              onClick={() => setSelectedIds(new Set())}
              title="Clear selection (Esc)"
            >
              ✕ Deselect
            </button>
          </div>
        </div>
      )}

      <div className="timeline-tools">
        {/* Select All Captions Toggle Button */}
        <button
          type="button"
          className={`timeline-select-all-btn ${selectedIds.size === captions.length && captions.length > 0 ? 'active' : ''}`}
          onClick={toggleSelectAll}
          title="Select all captions on the entire timeline (Ctrl+A)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>
            {selectedIds.size === captions.length && captions.length > 0 ? 'All Selected' : 'Select All'}
          </span>
          <span className="btn-count">({selectedIds.size > 0 ? `${selectedIds.size}/${captions.length}` : captions.length})</span>
        </button>

        <label className="timeline-zoom-label">
          Zoom{' '}
          <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </label>

        {/* SFX Timeline Toolbar Controls */}
        <div className="sfx-timeline-toolbar">
          <button
            type="button"
            className={`sfx-tool-toggle ${sfx.enabled ? 'on' : ''}`}
            onClick={() => {
              const nextEnabled = !sfx.enabled;
              setSfx({ enabled: nextEnabled });
              if (nextEnabled) playSfxSound(sfx.sound, sfx.volume);
            }}
            title="Toggle Synchronized Keyboard Typing SFX"
          >
            <span className="sfx-tool-icon">{sfx.enabled ? '🔊' : '🔇'}</span>
            <span>Typing SFX: {sfx.enabled ? 'ON' : 'OFF'}</span>
          </button>

          {sfx.enabled && (
            <>
              <select
                className="sfx-tool-select"
                value={sfx.sound}
                onChange={(e) => {
                  const snd = e.target.value as SfxSoundType;
                  setSfx({ sound: snd });
                  playSfxSound(snd, sfx.volume);
                }}
                title="Select Keyboard Sound Effect"
              >
                <option value="mechanical">⌨️ Mechanical Click</option>
                <option value="typewriter">🖨️ Typewriter</option>
                <option value="pop">💥 Pop Click</option>
                <option value="tap">🔉 Soft Tap</option>
              </select>

              <button
                type="button"
                className={`sfx-mode-toggle ${sfx.trigger === 'word' ? 'on' : ''}`}
                onClick={() => {
                  const nextTrig = sfx.trigger === 'word' ? 'caption' : 'word';
                  setSfx({ trigger: nextTrig });
                }}
                title="Trigger sound on Every Word vs Every Caption Block"
              >
                {sfx.trigger === 'word' ? '⚡ Words' : '📑 Captions'}
              </button>

              <div className="sfx-vol-box" title={`SFX Volume: ${Math.round(sfx.volume * 100)}%`}>
                <span className="sfx-vol-label">Vol</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={sfx.volume}
                  onChange={(e) => setSfx({ volume: Number(e.target.value) }, 'sfx-vol')}
                />
                <span className="sfx-vol-val">{Math.round(sfx.volume * 100)}%</span>
              </div>

              {/* Quick Timeline Range Buttons */}
              <div className="sfx-quick-actions">
                <button
                  type="button"
                  className="sfx-action-pill"
                  onClick={() => enableAllSfx()}
                  title="Apply typing sound across entire timeline (all subtitles)"
                >
                  ⚡ All
                </button>
                <button
                  type="button"
                  className="sfx-action-pill mute"
                  onClick={() => clearAllSfx(captions.map((c) => c.id))}
                  title="Remove / Clear sound effects from all subtitles"
                >
                  🗑️ Clear
                </button>
                <button
                  type="button"
                  className={`sfx-action-pill manage ${sfxManagerOpen ? 'active' : ''}`}
                  onClick={() => setSfxManagerOpen(!sfxManagerOpen)}
                  title="Open organized SFX manager for every word & subtitle"
                >
                  ⚙️ Manage SFX
                </button>
              </div>
            </>
          )}
        </div>

        <span className="timeline-hint">
          Click &quot;Select All&quot; or drag to select subtitles &amp; set position together.
        </span>
      </div>

      <div className="track-scroll" ref={scrollRef}>
        <div
          className="track-inner"
          ref={trackInnerRef}
          style={{ width }}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
        >
          {/* Ruler for timecodes and continuous click/drag scrubbing */}
          <div
            className="ruler"
            onPointerDown={startScrub}
            onPointerMove={moveScrub}
            onPointerUp={endScrub}
            onPointerCancel={endScrub}
          >
            {seconds.map((s) => (
              <span key={s} style={{ left: s * zoom }}>
                {s}s
              </span>
            ))}
          </div>

          <div
            className="caption-track"
            onPointerDown={startLasso}
          >
            {/* Lasso selection rectangle */}
            {lasso && (
              <div
                className="lasso-rect"
                style={{
                  left: Math.min(lasso.x0, lasso.x1),
                  width: Math.abs(lasso.x1 - lasso.x0),
                }}
              />
            )}

            {captions.map((caption, index) => {
              const shown = preview?.id === caption.id ? preview : { start: captionStart(caption), end: captionEnd(caption) };
              const isSelected = caption.id === selectedCaption;
              const isMultiSelected = selectedIds.has(caption.id);
              const hasOverride = !!doc?.captionStyles?.[caption.id];
              const isBehind = doc?.captionStyles?.[caption.id]?.behindPerson;
              return (
                <div
                  key={caption.id}
                  className={`block ${caption.id === activeId ? 'active' : ''} ${isSelected ? 'selected' : ''} ${isMultiSelected ? 'multi-selected' : ''} ${hasOverride ? 'customized' : ''}`}
                  style={{ left: shown.start * zoom, width: Math.max(4, (shown.end - shown.start) * zoom) }}
                  title={`Block ${index + 1}: ${caption.words.map((w) => w.text).join(' ')}${hasOverride ? ' (Customized)' : ''}${isMultiSelected ? ' (Selected)' : ''}`}
                  onPointerDown={(e) => {
                    e.stopPropagation(); // prevent lasso from starting on a block
                    // Shift-click: toggle this caption in multi-select
                    if (e.shiftKey) {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(caption.id)) next.delete(caption.id);
                        else next.add(caption.id);
                        return next;
                      });
                      return;
                    }
                    // Normal click: if not already multi-selected, single select
                    if (!isMultiSelected) {
                      setSelectedIds(new Set());
                    }
                    selectCaption(caption.id);
                    begin(e, caption, index, 'move');
                  }}
                  onDoubleClick={() => seek(captionStart(caption) + 0.001)}
                >
                  <i className="edge left" onPointerDown={(e) => { e.stopPropagation(); begin(e, caption, index, 'left'); }} />
                  <span className="block-content">
                    {hasOverride && (
                      <span className="block-custom-tag" title={isBehind ? 'Behind Person Active for this block' : 'Custom Style Active'}>
                        {isBehind ? '👤' : '★'}
                      </span>
                    )}
                    {isMultiSelected && (
                      <span className="block-multi-tag" title="Selected for Bulk Position">✓</span>
                    )}
                    <span className="block-text">{caption.words.map((w) => w.text).join(' ')}</span>
                  </span>
                  <i className="edge right" onPointerDown={(e) => { e.stopPropagation(); begin(e, caption, index, 'right'); }} />
                </div>
              );
            })}
          </div>

          {/* Editable SFX Sound Track (Clean, Organized, Pro Block-Bound Track) */}
          {sfx.enabled && (
            <div className="sfx-track" title="Typing SFX Track — Click subtitle to play, ✕ to delete SFX">
              <div className="sfx-track-header" onClick={() => setSfxManagerOpen(true)} title="Click to open full SFX Manager">
                <span className="sfx-track-label">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M8 12h.001M16 12h.001M7 16h10" />
                  </svg>
                  <span>SFX ({sfxCount})</span>
                </span>
              </div>

              {captions.map((caption, cIdx) => {
                const shown = preview?.id === caption.id ? preview : { start: captionStart(caption), end: captionEnd(caption) };
                const laneLeft = Math.max(0, shown.start + sfx.offset) * zoom;
                const laneWidth = Math.max(24, (shown.end - shown.start) * zoom);
                const mutedSet = new Set(sfx.mutedIds ?? []);
                const isCapMuted = mutedSet.has(caption.id);
                const isCur = Math.abs(playhead.get() - (shown.start + sfx.offset)) < 0.1;
                const isSelected = selectedIds.has(caption.id) || selectedCaption === caption.id;
                const isInspectorOpen = activeWordInspectorId === caption.id;

                return (
                  <div
                    key={`sfx-cap-${caption.id}`}
                    className={`sfx-block-unit ${isCapMuted ? 'muted' : ''} ${isCur ? 'active' : ''} ${isSelected ? 'selected' : ''} ${isInspectorOpen ? 'inspecting' : ''}`}
                    style={{ left: laneLeft, width: laneWidth }}
                    onClick={(e) => {
                      e.stopPropagation();
                      seek(shown.start + sfx.offset + 0.001);
                      if (!isCapMuted) playSfxSound(sfx.sound, sfx.volume);
                    }}
                    title={`#${cIdx + 1}: "${caption.words.map((w) => w.text).join(' ')}" — Click to play, ✎ to edit words, ✕ to delete SFX`}
                  >
                    <span className="sfx-key-icon">{isCapMuted ? '🔇' : '⌨'}</span>

                    {/* Smooth Subtitle Text (no squished dots or overlapping boxes) */}
                    {laneWidth >= 48 && (
                      <span className="sfx-key-text">{caption.words.map((w) => w.text).join(' ')}</span>
                    )}

                    {/* Subtle rhythmic beat ticks showing word sync timings */}
                    {!isCapMuted && sfx.trigger === 'word' && laneWidth >= 60 && (
                      <div className="sfx-beat-ticks" aria-hidden="true">
                        {caption.words.map((w, wIdx) => {
                          const id = w.tokenId ?? `${caption.id}:${w.text}:${wIdx}`;
                          const isWordMuted = mutedSet.has(id);
                          const capDur = Math.max(0.05, shown.end - shown.start);
                          const relPct = Math.max(2, Math.min(96, ((w.start - shown.start) / capDur) * 100));
                          return (
                            <span
                              key={id}
                              className={`sfx-beat-tick ${isWordMuted ? 'muted' : 'active'}`}
                              style={{ left: `${relPct}%` }}
                            />
                          );
                        })}
                      </div>
                    )}

                    {/* Quick Action Controls on the block */}
                    <div className="sfx-unit-actions" onClick={(e) => e.stopPropagation()}>
                      {/* Word Inspector Toggle Button */}
                      {caption.words.length > 1 && (
                        <button
                          type="button"
                          className={`sfx-words-edit-btn ${isInspectorOpen ? 'active' : ''}`}
                          onClick={() => setActiveWordInspectorId(isInspectorOpen ? null : caption.id)}
                          title="Open word-by-word SFX editor for this subtitle"
                        >
                          ✎
                        </button>
                      )}

                      {/* Delete / Add Subtitle Sound */}
                      <button
                        type="button"
                        className={`sfx-key-mute ${isCapMuted ? 'add-btn' : 'del-btn'}`}
                        onClick={() => toggleSfxMute(caption.id)}
                        title={isCapMuted ? 'Add SFX back to this subtitle' : 'Delete SFX from this subtitle'}
                      >
                        {isCapMuted ? '+' : '✕'}
                      </button>
                    </div>

                    {/* Inline Floating Word SFX Inspector Popover */}
                    {isInspectorOpen && (
                      <div className="sfx-word-inspector-popover" onClick={(e) => e.stopPropagation()}>
                        <div className="sfx-popover-header">
                          <span className="popover-title">
                            ⌨ SFX Words (#{cIdx + 1}): &quot;{caption.words.map((w) => w.text).join(' ')}&quot;
                          </span>
                          <button
                            type="button"
                            className="sfx-popover-close"
                            onClick={() => setActiveWordInspectorId(null)}
                            title="Close"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="sfx-popover-words">
                          {caption.words.map((w, wIdx) => {
                            const id = w.tokenId ?? `${caption.id}:${w.text}:${wIdx}`;
                            const isWordMuted = isCapMuted || mutedSet.has(id);
                            return (
                              <div
                                key={id}
                                className={`sfx-word-chip ${isWordMuted ? 'muted' : 'active'}`}
                                onClick={() => {
                                  seek(w.start + sfx.offset + 0.001);
                                  if (!isWordMuted) playSfxSound(sfx.sound, sfx.volume);
                                }}
                                title={`Click to play sound. Click ${isWordMuted ? '+' : '✕'} to toggle.`}
                              >
                                <span className="chip-time">{w.start.toFixed(1)}s</span>
                                <span className="chip-text">{w.text}</span>
                                <button
                                  type="button"
                                  className={`chip-toggle-btn ${isWordMuted ? 'add' : 'del'}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSfxMute(id);
                                  }}
                                  title={isWordMuted ? `Add SFX to "${w.text}"` : `Delete SFX from "${w.text}"`}
                                >
                                  {isWordMuted ? '+' : '✕'}
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        <div className="sfx-popover-footer">
                          <button
                            type="button"
                            className="sfx-pop-action-btn"
                            onClick={() => {
                              // Enable all words in this caption
                              for (let i = 0; i < caption.words.length; i++) {
                                const id = caption.words[i].tokenId ?? `${caption.id}:${caption.words[i].text}:${i}`;
                                if (mutedSet.has(id)) toggleSfxMute(id);
                              }
                              if (isCapMuted) toggleSfxMute(caption.id);
                            }}
                          >
                            ⚡ Enable All Words
                          </button>
                          <button
                            type="button"
                            className="sfx-pop-action-btn mute"
                            onClick={() => {
                              // Mute this entire caption
                              if (!isCapMuted) toggleSfxMute(caption.id);
                            }}
                          >
                            🔇 Mute Subtitle
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Audio Waveform Track */}
          <canvas
            className="wave"
            ref={waveRef}
            onPointerDown={startScrub}
            onPointerMove={moveScrub}
            onPointerUp={endScrub}
            onPointerCancel={endScrub}
          />

          {/* Professional Interactive Playhead / CTI */}
          <div
            className={`needle ${scrubbing ? 'scrubbing' : ''}`}
            ref={needleRef}
            onPointerDown={startScrub}
            onPointerMove={moveScrub}
            onPointerUp={endScrub}
            onPointerCancel={endScrub}
            title="Drag Playhead to scrub"
            role="slider"
            aria-label="Timeline playhead"
            aria-valuemin={0}
            aria-valuemax={duration}
          >
            {/* Top Marker Handle */}
            <div className="needle-handle">
              <svg width="14" height="20" viewBox="0 0 14 20" fill="none">
                <path
                  d="M1 2C1 1.44772 1.44772 1 2 1H12C12.5523 1 13 1.44772 13 2V12.5858C13 12.851 12.8946 13.1054 12.7071 13.2929L7.70711 18.2929C7.31658 18.6834 6.68342 18.6834 6.29289 18.2929L1.29289 13.2929C1.10536 13.1054 1 12.851 1 12.5858V2Z"
                  fill="#ff5e36"
                  stroke="#ffffff"
                  strokeWidth="1.2"
                />
              </svg>
              {/* Tooltip showing timestamp on hover and scrub */}
              <span className="needle-tooltip" ref={tooltipRef}>
                0:00.00
              </span>
            </div>

            {/* Glowing vertical needle line */}
            <div className="needle-line" />
          </div>
        </div>
      </div>

      {/* SFX Manager Modal — Organized Edit & Manage View */}
      {sfxManagerOpen && (
        <div className="sfx-modal-overlay" onClick={() => setSfxManagerOpen(false)}>
          <div className="sfx-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="sfx-modal-header">
              <div className="sfx-modal-title-group">
                <span className="sfx-modal-icon">⌨</span>
                <h3>Typing Sound Effects (SFX) Manager</h3>
                <span className="sfx-active-tag">{sfxCount} Active Sounds</span>
              </div>
              <button
                type="button"
                className="ghost sfx-modal-close"
                onClick={() => setSfxManagerOpen(false)}
                title="Close SFX Manager (Esc)"
              >
                ✕
              </button>
            </div>

            <div className="sfx-modal-toolbar">
              <div className="sfx-modal-batch">
                <span className="modal-label">Quick Actions:</span>
                <button
                  type="button"
                  className="bulk-sfx-btn on"
                  onClick={() => enableAllSfx()}
                  title="Enable SFX on all captions across entire video"
                >
                  ⚡ Apply to All Subtitles
                </button>
                <button
                  type="button"
                  className="bulk-sfx-btn mute"
                  onClick={() => clearAllSfx(captions.map((c) => c.id))}
                  title="Delete/Mute SFX on all captions"
                >
                  🗑️ Delete All SFX
                </button>
                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    className="bulk-sfx-btn on"
                    onClick={() => setBulkCaptionSfx([...selectedIds], true)}
                    title="Apply to selected subtitles"
                  >
                    🎯 Apply to {selectedIds.size} Selected
                  </button>
                )}
              </div>

              <div className="sfx-modal-sound-ctrl">
                <select
                  value={sfx.sound}
                  onChange={(e) => {
                    const snd = e.target.value as SfxSoundType;
                    setSfx({ sound: snd });
                    playSfxSound(snd, sfx.volume);
                  }}
                  className="sfx-tool-select"
                >
                  <option value="mechanical">⌨️ Mechanical Click</option>
                  <option value="typewriter">🖨️ Typewriter</option>
                  <option value="pop">💥 Pop Click</option>
                  <option value="tap">🔉 Soft Tap</option>
                </select>

                <div className="sfx-vol-box">
                  <span className="sfx-vol-label">Vol</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={sfx.volume}
                    onChange={(e) => setSfx({ volume: Number(e.target.value) }, 'sfx-vol')}
                  />
                  <span className="sfx-vol-val">{Math.round(sfx.volume * 100)}%</span>
                </div>
              </div>
            </div>

            <div className="sfx-modal-search-bar">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search word or subtitle to manage sound..."
                value={sfxSearch}
                onChange={(e) => setSfxSearch(e.target.value)}
                className="sfx-search-input"
              />
              {sfxSearch && (
                <button
                  type="button"
                  className="sfx-search-clear"
                  onClick={() => setSfxSearch('')}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="sfx-modal-list">
              <div className="sfx-list-heading">
                <span>Timeline Subtitles ({captions.length})</span>
                <span className="heading-hint">Click ✕ to delete SFX from any word or subtitle</span>
              </div>
              {captions
                .filter((cap) => {
                  if (!sfxSearch.trim()) return true;
                  const q = sfxSearch.toLowerCase();
                  return cap.words.some((w) => w.text.toLowerCase().includes(q));
                })
                .map((cap, cIdx) => {
                const mutedSet = new Set(sfx.mutedIds ?? []);
                const isCapMuted = mutedSet.has(cap.id);
                return (
                  <div key={cap.id} className={`sfx-modal-row ${isCapMuted ? 'muted' : 'active'}`}>
                    <div className="sfx-row-meta">
                      <span className="sfx-row-num">#{cIdx + 1}</span>
                      <span className="sfx-row-time">
                        {captionStart(cap).toFixed(1)}s – {captionEnd(cap).toFixed(1)}s
                      </span>
                      <button
                        type="button"
                        className={`sfx-cap-toggle-btn ${isCapMuted ? 'off' : 'on'}`}
                        onClick={() => toggleSfxMute(cap.id)}
                        title={isCapMuted ? 'Add SFX to this subtitle' : 'Delete SFX from this subtitle'}
                      >
                        {isCapMuted ? '+ Add SFX' : '✓ SFX Active'}
                      </button>
                    </div>

                    <div className="sfx-words-chips">
                      {cap.words.map((w, wIdx) => {
                        const id = w.tokenId ?? `${cap.id}:${w.text}:${wIdx}`;
                        const isWordMuted = isCapMuted || mutedSet.has(id);
                        const isMatch = sfxSearch.trim() && w.text.toLowerCase().includes(sfxSearch.toLowerCase());
                        return (
                          <div
                            key={id}
                            className={`sfx-word-pill ${isWordMuted ? 'deleted' : 'active'} ${isMatch ? 'highlight-match' : ''}`}
                            onClick={() => {
                              seek(w.start + sfx.offset + 0.001);
                              if (!isWordMuted) playSfxSound(sfx.sound, sfx.volume);
                            }}
                            title={`Click to preview sound. Click ${isWordMuted ? '+' : '✕'} to toggle.`}
                          >
                            <span className="word-text">{w.text}</span>
                            <button
                              type="button"
                              className="word-del-icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSfxMute(id);
                              }}
                              title={isWordMuted ? 'Re-add SFX for this word' : 'Delete SFX for this word'}
                            >
                              {isWordMuted ? '+' : '✕'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="sfx-modal-footer">
              <span className="footer-tip">
                💡 Tip: You can also delete or add SFX directly on the timeline track by clicking ✕ or + on any word!
              </span>
              <button
                type="button"
                className="primary sfx-done-btn"
                onClick={() => setSfxManagerOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
