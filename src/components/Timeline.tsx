'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { playSfxSound, type SfxSoundType } from '@/engine/sfx';
import { captionEnd, captionStart, type Caption } from '@/engine/types';
import { resolveSfx, useEditor } from '@/state/editor';
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
  const [zoom, setZoom] = useState(70);

  const sfxCount = useMemo(() => {
    if (!sfx.enabled) return 0;
    if (sfx.trigger === 'word') {
      return captions.reduce((sum, c) => sum + c.words.length, 0);
    }
    return captions.length;
  }, [captions, sfx.enabled, sfx.trigger]);
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
    const drag = dragRef.current;
    const moved = movedRef.current;
    if (drag && moved) retime(moved.id, drag.start - offset, drag.end - offset, moved.start - offset, moved.end - offset);
    dragRef.current = null;
    movedRef.current = null;
    setPreview(null);
  };

  const seconds: number[] = [];
  const stepBy = zoom < 40 ? 5 : zoom < 100 ? 2 : 1;
  for (let s = 0; s < duration; s += stepBy) seconds.push(s);

  return (
    <section className="timeline">
      <div className="timeline-tools">
        <label>
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
            </>
          )}
        </div>

        <span className="timeline-hint">Drag captions or click SFX capsules to edit timing/mute.</span>
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

          <div className="caption-track">
            {captions.map((caption, index) => {
              const shown = preview?.id === caption.id ? preview : { start: captionStart(caption), end: captionEnd(caption) };
              const isSelected = caption.id === selectedCaption;
              const hasOverride = !!doc?.captionStyles?.[caption.id];
              const isBehind = doc?.captionStyles?.[caption.id]?.behindPerson;
              return (
                <div
                  key={caption.id}
                  className={`block ${caption.id === activeId ? 'active' : ''} ${isSelected ? 'selected' : ''} ${hasOverride ? 'customized' : ''}`}
                  style={{ left: shown.start * zoom, width: Math.max(4, (shown.end - shown.start) * zoom) }}
                  title={`Block ${index + 1}: ${caption.words.map((w) => w.text).join(' ')}${hasOverride ? ' (Customized)' : ''}`}
                  onPointerDown={(e) => {
                    selectCaption(caption.id);
                    begin(e, caption, index, 'move');
                  }}
                  onDoubleClick={() => seek(captionStart(caption) + 0.001)}
                >
                  <i className="edge left" onPointerDown={(e) => begin(e, caption, index, 'left')} />
                  <span className="block-content">
                    {hasOverride && (
                      <span className="block-custom-tag" title={isBehind ? 'Behind Person Active for this block' : 'Custom Style Active'}>
                        {isBehind ? '👤' : '★'}
                      </span>
                    )}
                    <span className="block-text">{caption.words.map((w) => w.text).join(' ')}</span>
                  </span>
                  <i className="edge right" onPointerDown={(e) => begin(e, caption, index, 'right')} />
                </div>
              );
            })}
          </div>

          {/* Editable SFX Sound Track (Professional DAW / NLE Block-Bound Track) */}
          {sfx.enabled && (
            <div className="sfx-track" title="Keyboard Typing Sound Track — Auto-shrinks with subtitles, click to preview/jump, ✕ to mute">
              <div className="sfx-track-header">
                <span className="sfx-track-label">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M8 12h.001M16 12h.001M7 16h10" />
                  </svg>
                  <span>SFX ({sfxCount})</span>
                </span>
              </div>

              {captions.map((caption) => {
                const shown = preview?.id === caption.id ? preview : { start: captionStart(caption), end: captionEnd(caption) };
                const laneLeft = Math.max(0, shown.start + sfx.offset) * zoom;
                const laneWidth = Math.max(8, (shown.end - shown.start) * zoom);
                const mutedSet = new Set(sfx.mutedIds ?? []);

                if (sfx.trigger === 'caption') {
                  const isMuted = mutedSet.has(caption.id);
                  const isCur = Math.abs(playhead.get() - (shown.start + sfx.offset)) < 0.1;
                  return (
                    <div
                      key={`sfx-cap-${caption.id}`}
                      className={`sfx-block-unit ${isMuted ? 'muted' : ''} ${isCur ? 'active' : ''}`}
                      style={{ left: laneLeft, width: laneWidth }}
                      onClick={(e) => {
                        e.stopPropagation();
                        seek(shown.start + sfx.offset + 0.001);
                        if (!isMuted) playSfxSound(sfx.sound, sfx.volume);
                      }}
                      title={`SFX Caption Click (${(shown.start + sfx.offset).toFixed(2)}s) — Click to play, ✕ to mute`}
                    >
                      <span className="sfx-key-icon">{isMuted ? '🔇' : '⌨'}</span>
                      {laneWidth >= 50 && (
                        <span className="sfx-key-text">{caption.words.map((w) => w.text).join(' ')}</span>
                      )}
                      <button
                        type="button"
                        className="sfx-key-mute"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSfxMute(caption.id);
                        }}
                        title={isMuted ? 'Unmute' : 'Mute'}
                      >
                        {isMuted ? '+' : '×'}
                      </button>
                    </div>
                  );
                }

                // Word-by-word synchronized keycaps bounded to subtitle block lane:
                return (
                  <div
                    key={`sfx-lane-${caption.id}`}
                    className="sfx-block-lane"
                    style={{ left: laneLeft, width: laneWidth }}
                  >
                    {caption.words.map((w, wIdx) => {
                      const id = w.tokenId ?? `${caption.id}:${w.text}:${wIdx}`;
                      const isMuted = mutedSet.has(id);
                      const wStartRel = Math.max(0, w.start - shown.start);
                      const segLeft = wStartRel * zoom;
                      const segWidth = Math.max(5, (w.end - w.start) * zoom - 1);
                      const isCur = Math.abs(playhead.get() - (w.start + sfx.offset)) < 0.08;

                      return (
                        <div
                          key={id}
                          className={`sfx-key-segment ${isMuted ? 'muted' : ''} ${isCur ? 'active' : ''}`}
                          style={{ left: segLeft, width: segWidth }}
                          onClick={(e) => {
                            e.stopPropagation();
                            seek(w.start + sfx.offset + 0.001);
                            if (!isMuted) playSfxSound(sfx.sound, sfx.volume);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            toggleSfxMute(id);
                          }}
                          title={`"${w.text}" (${(w.start + sfx.offset).toFixed(2)}s) — Click to play, double-click or ✕ to mute`}
                        >
                          {segWidth >= 46 ? (
                            <>
                              <span className="sfx-key-icon">{isMuted ? '🔇' : '⌨'}</span>
                              <span className="sfx-key-text">{w.text}</span>
                              <button
                                type="button"
                                className="sfx-key-mute"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSfxMute(id);
                                }}
                                title={isMuted ? 'Unmute' : 'Mute'}
                              >
                                {isMuted ? '+' : '×'}
                              </button>
                            </>
                          ) : segWidth >= 22 ? (
                            <span className="sfx-key-text">{w.text}</span>
                          ) : (
                            <span className="sfx-key-pip" />
                          )}
                        </div>
                      );
                    })}
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
    </section>
  );
}
