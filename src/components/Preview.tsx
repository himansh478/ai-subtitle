'use client';

import { useEffect, useImperativeHandle, useRef, useState, type PointerEvent, type Ref } from 'react';
import type { TextureSource } from 'canvaskit-wasm';
import { planPositions } from '@/engine/avoid';
import { exportVideo, outputSize, type Crop, type ExportSettings } from '@/engine/export';
import { cameraPath, cropShare, framedFaces } from '@/engine/framing';
import { exportOverlay, sourceFrameRate } from '@/engine/overlay';
import { buildCaptions } from '@/engine/group';
import { playSfxSound } from '@/engine/sfx';
import { drawCutout, PersonMask } from '@/engine/segment';
import { createStudio, type Studio } from '@/engine/studio';
import { faceTrack } from '@/engine/tracking';
import { captionEnd, captionStart, type Caption, type Style } from '@/engine/types';
import { currentWatermark } from '@/lib/account';
import { api } from '@/lib/auth';
import { openExport, readExport } from '@/lib/storage';
import { neededFamilies, resolveSfx, resolveStyle, useEditor } from '@/state/editor';
import { playhead } from '@/state/playhead';

const FRAME = 1 / 30;
/** Pixels the pointer must travel before a click on a word becomes a drag. */
const DRAG_START = 4;
const CENTRE = 0.5;
/** How near the middle of the frame a dragged caption catches, as a share of its height. */
const CENTRE_SNAP = 0.015;
/** How often the server is told where the vertical frame moves. */
const CAMERA_STEP = 0.2;
/** Part of a server export's progress bar that is the browser's own work. */
const OVERLAY_SHARE = 0.5;

type Exported = { file: File; seconds: number; frames: number };

export type PreviewHandle = {
  toggle(): void;
  seek(time: number): void;
  step(direction: number, frames: number): void;
  exportMp4(settings: ExportSettings, onProgress: (fraction: number) => void): Promise<Exported>;
  exportOverlay(settings: ExportSettings, onProgress: (fraction: number) => void): Promise<Exported>;
  exportOnServer(settings: ExportSettings, onProgress: (fraction: number) => void): Promise<Exported>;
};

const clock = (t: number) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const f = Math.floor((t % 1) * 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
};

// Video is shown by the browser for smooth playback and synced sound. Captions sit
// on a canvas above it, drawn by the same renderer the export uses.
export function Preview({
  ref,
  video,
  captions,
  size,
}: {
  ref: Ref<PreviewHandle>;
  video: File;
  captions: Caption[];
  size: { width: number; height: number };
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const studioRef = useRef<Studio | null>(null);
  const captionsRef = useRef(captions);
  const pressRef = useRef<{ y: number; tokenId?: string; captionId?: string; moved: boolean } | null>(null);
  const planRef = useRef<{ key: unknown[]; at: (caption: Caption, time: number) => number } | null>(null);
  const trackRef = useRef<{ faces: unknown; at: ReturnType<typeof faceTrack> } | null>(null);
  const cropRef = useRef<{ faces: unknown; crop: Crop } | null>(null);
  const personRef = useRef<PersonMask | null>(null);
  const exportingRef = useRef(false);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [safe, setSafe] = useState(size.height > size.width);
  const [centred, setCentred] = useState(false);

  const families = useEditor((s) => (s.doc ? neededFamilies(s.doc).join('|') : ''));
  const behind = useEditor((s) => !!s.doc?.behindPerson || Object.values(s.doc?.captionStyles ?? {}).some((c) => !!c.behindPerson));
  const blend = useEditor((s) => (s.doc ? resolveStyle(s.doc).blend : 'normal'));
  const videoWidth = useEditor((s) => (s.doc?.reframe && s.project ? 100 / cropShare(s.project.media.width, s.project.media.height) : null));

  useEffect(() => {
    const next = URL.createObjectURL(video);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [video]);

  /** The moving 9:16 window, when a wide video is being reframed. */
  const currentCrop = (): Crop | null => {
    const { doc, project } = useEditor.getState();
    if (!doc?.reframe || !project) return null;
    if (!cropRef.current || cropRef.current.faces !== project.faces) {
      const share = cropShare(project.media.width, project.media.height);
      cropRef.current = { faces: project.faces, crop: { share, leftAt: cameraPath(project.faces, share) } };
    }
    return cropRef.current.crop;
  };

  /** The style for a caption at a time, including per-block overrides and face avoidance. */
  const styler = (): ((caption: Caption, time: number) => Style) => {
    const { doc, project } = useEditor.getState();
    const studio = studioRef.current;
    const baseStyle = resolveStyle(doc!);
    const faces = project?.faces;

    const forCaption = (caption: Caption): Style => {
      const override = doc?.captionStyles?.[caption.id];
      if (!override) return baseStyle;
      return {
        ...baseStyle,
        ...override,
        stroke: override.stroke !== undefined ? override.stroke : baseStyle.stroke,
        shadow: override.shadow !== undefined ? override.shadow : baseStyle.shadow,
      };
    };

    if (!studio || !faces?.length) return (caption) => forCaption(caption);

    const crop = currentCrop();
    if (doc?.followFace && !crop) {
      if (trackRef.current?.faces !== faces) trackRef.current = { faces, at: faceTrack(faces) };
      const { at } = trackRef.current;
      return (caption, time) => {
        const style = forCaption(caption);
        const { dx, dy } = at(time);
        return {
          ...style,
          anchorX: Math.min(0.92, Math.max(0.08, style.anchorX + dx)),
          anchorY: Math.min(0.95, Math.max(0.05, style.anchorY + dy)),
        };
      };
    }

    if (!doc?.avoidFaces) return (caption) => forCaption(caption);

    const key = [doc, captionsRef.current, faces];
    if (!planRef.current || planRef.current.key.some((part, i) => part !== key[i])) {
      const measure = (caption: Caption, s: Style) => studio.renderer.measure(caption, s);
      const seen = crop ? framedFaces(faces, crop.leftAt, crop.share) : faces;
      planRef.current = { key, at: planPositions(captionsRef.current, baseStyle, seen, measure, size.height > size.width) };
    }
    const { at } = planRef.current;
    return (caption, time) => {
      const style = forCaption(caption);
      const anchorY = doc?.captionStyles?.[caption.id]?.anchorY !== undefined ? style.anchorY : at(caption, time);
      return { ...style, anchorY };
    };
  };

  const draw = (time: number) => {
    const studio = studioRef.current;
    const { doc } = useEditor.getState();
    if (!studio || !doc || exportingRef.current) return;
    const canvas = studio.surface.getCanvas();
    canvas.clear(studio.ck.TRANSPARENT);
    const styleAt = styler();
    studio.renderer.draw(canvas, captionsRef.current, time, (caption) => styleAt(caption, time));

    const el = videoRef.current;
    const crop = currentCrop();
    const view = { left: crop ? crop.leftAt(time) : 0, share: crop?.share ?? 1 };
    if (crop && el) el.style.left = `${(-view.left / view.share) * 100}%`;

    const person = personRef.current;
    const currentCaption = captionsRef.current.find(
      (c) => time >= captionStart(c) && time < captionEnd(c)
    );
    const isBehind = currentCaption
      ? (doc.captionStyles?.[currentCaption.id]?.behindPerson ?? !!doc.behindPerson)
      : !!doc.behindPerson;

    if (isBehind && person && el && el.readyState >= 2) {
      const { ck, surface } = studio;
      const frame = surface.makeImageFromTextureSource(el as unknown as TextureSource, {
        width: el.videoWidth,
        height: el.videoHeight,
        alphaType: ck.AlphaType.Premul,
        colorType: ck.ColorType.RGBA_8888,
        colorSpace: ck.ColorSpace.SRGB,
      });
      const mask = person.read(ck, el);
      if (frame && mask) drawCutout(ck, canvas, frame, mask, view, ck.LTRBRect(0, 0, size.width, size.height));
      mask?.delete();
      frame?.delete();
    }
    if (useEditor.getState().watermark) studio.renderer.drawWatermark(canvas);
    studio.surface.flush();
  };

  const redraw = () => draw(playhead.get());

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    createStudio(canvasEl, size.width, size.height).then(async (studio) => {
      studioRef.current = studio;
      await Promise.all(families.split('|').map((family) => studio.fonts.ensure(family)));
      // Anything drawn while the fonts were loading was measured without them.
      studio.renderer.dispose();
      planRef.current = null;
      redraw();
    });
    // The studio is created once for this canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const studio = studioRef.current;
    if (!studio || !families) return;
    Promise.all(families.split('|').map((family) => studio.fonts.ensure(family))).then(() => {
      studio.renderer.dispose();
      planRef.current = null;
      redraw();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [families]);

  useEffect(() => {
    if (!behind || personRef.current) return;
    PersonMask.create()
      .then((person) => {
        personRef.current = person;
        redraw();
      })
      .catch(() => useEditor.getState().setNotice("Couldn't load the person cutout."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [behind]);

  useEffect(() => {
    captionsRef.current = captions;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captions]);

  useEffect(() =>
    useEditor.subscribe((s, p) => {
      if (s.doc !== p.doc && s.doc) {
        captionsRef.current = buildCaptions(s.doc);
      }
      if (s.doc !== p.doc || s.project !== p.project || s.watermark !== p.watermark) {
        redraw();
      }
    })
  );

  useEffect(() => {
    const show = (time: number) => {
      if (clockRef.current) clockRef.current.textContent = clock(time);
    };
    return playhead.subscribe(show);
  }, []);

  const lastSfxTimeRef = useRef<number>(-1);

  // While playing, follow the video's own clock on every display frame.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const el = videoRef.current;
      if (el) {
        playhead.set(el.currentTime);
        draw(el.currentTime);

        // Synchronize keyboard typing sound effect
        const curTime = el.currentTime;
        const prevTime = lastSfxTimeRef.current;
        if (prevTime < 0 || Math.abs(curTime - prevTime) > 0.3) {
          lastSfxTimeRef.current = curTime;
        } else if (curTime > prevTime) {
          const sfx = resolveSfx(useEditor.getState().doc);
          if (sfx.enabled && sfx.volume > 0) {
            const mutedSet = new Set(sfx.mutedIds ?? []);
            if (sfx.trigger === 'word') {
              for (const cap of captionsRef.current) {
                for (const w of cap.words) {
                  const t = w.start + sfx.offset;
                  if (t > prevTime && t <= curTime) {
                    const id = w.tokenId ?? `${cap.id}:${w.text}`;
                    if (!mutedSet.has(id)) {
                      playSfxSound(sfx.sound, sfx.volume);
                    }
                  }
                }
              }
            } else {
              for (const cap of captionsRef.current) {
                const t = captionStart(cap) + sfx.offset;
                if (t > prevTime && t <= curTime) {
                  if (!mutedSet.has(cap.id)) {
                    playSfxSound(sfx.sound, sfx.volume);
                  }
                }
              }
            }
          }
          lastSfxTimeRef.current = curTime;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const seek = (time: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(time, el.duration || time));
    playhead.set(el.currentTime);
    draw(el.currentTime);
  };

  /** The captions alone, as a transparent MOV in this project's storage. */
  const renderOverlay = async (settings: ExportSettings, name: string, onProgress: (fraction: number) => void) => {
    const { doc, project } = useEditor.getState();
    if (!doc || !project) throw new Error('The editor is still loading.');
    await safePause(videoRef.current);

    const target = outputSize(project.media, !!doc.reframe, settings.quality);
    const fps = settings.fps === 60 ? 60 : await sourceFrameRate(video);
    const watermark = await currentWatermark();
    const writable = await openExport(project.id, name);
    const job = { ...target, fps, duration: project.media.duration, captions: captionsRef.current, styleAt: styler(), watermark, writable, onProgress };
    const result = await exportOverlay(job);
    return { ...result, target, file: await readExport(project.id, name) };
  };

  useImperativeHandle(ref, () => ({
    toggle() {
      const el = videoRef.current;
      if (!el) return;
      if (el.paused) {
        safePlay(el);
      } else {
        safePause(el);
      }
    },
    seek,
    step(direction, frames) {
      safePause(videoRef.current);
      seek(playhead.get() + direction * frames * FRAME);
    },
    async exportMp4(settings, onProgress) {
      const { doc, project } = useEditor.getState();
      if (!studioRef.current || !doc || !project) throw new Error('The editor is still loading.');
      await safePause(videoRef.current);
      exportingRef.current = true;

      // The export has its own canvas, so it can be larger than the preview.
      const target = outputSize(project.media, !!doc.reframe, settings.quality);
      const canvasEl = document.createElement('canvas');
      canvasEl.width = target.width;
      canvasEl.height = target.height;
      try {
        const studio = await createStudio(canvasEl, target.width, target.height);
        const anyBehind = !!doc.behindPerson || Object.values(doc.captionStyles ?? {}).some((s) => !!s.behindPerson);
        const person = anyBehind ? await PersonMask.create() : null;
        const isBehindAt = (time: number) => {
          const cap = captionsRef.current.find((c) => time >= captionStart(c) && time < captionEnd(c));
          return cap ? (doc.captionStyles?.[cap.id]?.behindPerson ?? !!doc.behindPerson) : !!doc.behindPerson;
        };
        const watermark = await currentWatermark();
        const writable = await openExport(project.id, 'export.mp4');
        const job = { video, captions: captionsRef.current, styleAt: styler(), writable, settings, person, isBehindAt, watermark, crop: currentCrop(), onProgress };
        const result = await exportVideo(studio, canvasEl, job);
        person?.close();
        studio.renderer.dispose();
        studio.surface.delete();
        return { ...result, file: await readExport(project.id, 'export.mp4') };
      } finally {
        canvasEl.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
        exportingRef.current = false;
        redraw();
      }
    },
    async exportOverlay(settings, onProgress) {
      const { file, seconds, frames } = await renderOverlay(settings, 'captions.mov', onProgress);
      return { file, seconds, frames };
    },
    async exportOnServer(settings, onProgress) {
      const { project } = useEditor.getState();
      if (!project) throw new Error('The editor is still loading.');
      const started = performance.now();
      const { file: overlay, frames, target } = await renderOverlay(settings, 'captions.mov', (part) => onProgress(part * OVERLAY_SHARE));

      const crop = currentCrop();
      const path: { time: number; left: number }[] = [];
      if (crop) for (let time = 0; time < project.media.duration; time += CAMERA_STEP) path.push({ time, left: crop.leftAt(time) });

      const form = new FormData();
      form.set('video', video);
      form.set('overlay', overlay);
      form.set('options', JSON.stringify({ ...target, crop: crop && { share: crop.share, path } }));

      const res = await api('/api/export', { method: 'POST', body: form });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(error ?? 'The server could not make this video.');
      }

      const writable = await openExport(project.id, 'export.mp4');
      await writable.write(await res.blob());
      await writable.close();
      onProgress(1);
      return { file: await readExport(project.id, 'export.mp4'), seconds: (performance.now() - started) / 1000, frames };
    },
  }));

  // A click on a word selects it, a drag moves the captions, and a click elsewhere plays.
  const grab = (e: PointerEvent<HTMLCanvasElement>) => {
    const studio = studioRef.current;
    if (!studio) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * size.width;
    const y = ((e.clientY - box.top) / box.height) * size.height;
    const time = playhead.get();
    const styleAt = styler();
    const hit = studio.renderer.locate(captionsRef.current, time, (caption) => styleAt(caption, time), x, y);
    if (!hit) {
      useEditor.getState().selectToken(null);
      useEditor.getState().selectCaption(null);
      previewToggle(videoRef.current);
      return;
    }
    pressRef.current = { y: e.clientY, tokenId: hit.caption.words[hit.index].tokenId, captionId: hit.caption.id, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const release = () => {
    const press = pressRef.current;
    pressRef.current = null;
    setCentred(false);
    if (press && !press.moved) {
      if (press.tokenId) {
        useEditor.getState().selectToken(press.tokenId);
      } else if (press.captionId) {
        useEditor.getState().selectCaption(press.captionId);
      }
    }
  };

  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const press = pressRef.current;
    if (!press) return;
    if (!press.moved && Math.abs(e.clientY - press.y) < DRAG_START) return;
    press.moved = true;
    const box = e.currentTarget.getBoundingClientRect();
    const anchorY = Math.min(0.95, Math.max(0.05, (e.clientY - box.top) / box.height));
    const snapped = Math.abs(anchorY - CENTRE) < CENTRE_SNAP;
    setCentred(snapped);
    const newY = snapped ? CENTRE : Math.round(anchorY * 1000) / 1000;
    if (press.captionId) {
      useEditor.getState().setCaptionStyle(press.captionId, { anchorY: newY }, 'block-y');
    } else {
      useEditor.getState().setStyle({ anchorY: newY }, 'position');
    }
  };

  const ratio = size.width / size.height;

  return (
    <section className="stage">
      <div className="viewport">
        <div className="frame" style={{ aspectRatio: ratio, width: `min(100cqw, calc(100cqh * ${ratio}))` }}>
          {url && (
            <video
              ref={videoRef}
              src={url}
              playsInline
              style={videoWidth ? { position: 'absolute', top: 0, height: '100%', width: `${videoWidth}%`, maxWidth: 'none' } : undefined}
              onLoadedData={(e) => {
                e.currentTarget.currentTime = playhead.get();
                redraw();
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onSeeked={(e) => {
                playhead.set(e.currentTarget.currentTime);
                draw(e.currentTarget.currentTime);
              }}
              onTimeUpdate={(e) => {
                if (!playing) return;
                playhead.set(e.currentTarget.currentTime);
              }}
            />
          )}
          <canvas
            id="stage"
            ref={canvasRef}
            width={size.width}
            height={size.height}
            style={{ mixBlendMode: blend === 'normal' ? undefined : blend }}
            onPointerDown={grab}
            onPointerMove={move}
            onPointerUp={release}
          />
          {safe && (
            <div className="safe" aria-hidden>
              {/* Top Unsafe Header Line (Instagram Reels / TikTok Search & Navigation) */}
              <div className="safe-zone safe-zone-top" style={{ left: 0, right: 0, top: 0, height: '13%' }}>
                <span className="safe-zone-label">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                  HEADER SAFE LINE (13%)
                </span>
              </div>

              {/* Bottom Unsafe Zone (Captions, Audio Title, Creator Profile & Bio) */}
              <div className="safe-zone safe-zone-bottom" style={{ left: 0, right: 0, bottom: 0, height: '20%' }}>
                <span className="safe-zone-label">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                  BOTTOM SAFE LINE (20% UI COVER)
                </span>
              </div>

              {/* Right Unsafe Zone (Like, Comment, Share, Sound Disc Icons) */}
              <div className="safe-zone safe-zone-right" style={{ right: 0, top: '13%', bottom: '20%', width: '13%' }}>
                <span className="safe-zone-label-vertical">
                  ICONS (13%)
                </span>
              </div>

              {/* Central Safe Text & Subtitles Framing Guide */}
              <div className="safe-content-box" style={{ left: 0, right: '13%', top: '13%', bottom: '20%' }}>
                <span className="safe-content-tag">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  SAFE SUBTITLE AREA
                </span>
              </div>
            </div>
          )}
          {centred && <i className="centre-line" aria-hidden />}
        </div>
      </div>
      <div className="transport">
        <div className="transport-controls">
          <button
            type="button"
            className="ghost transport-step-btn"
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 1);
                playhead.set(videoRef.current.currentTime);
                redraw();
              }
            }}
            title="Step back 1s (Left Arrow / J)"
            aria-label="Step back 1 second"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polygon points="11 19 2 12 11 5 11 19" />
              <polygon points="22 19 13 12 22 5 22 19" />
            </svg>
            <span>-1s</span>
          </button>

          <button
            type="button"
            className={`transport-play-btn ${playing ? 'playing' : ''}`}
            onClick={() => previewToggle(videoRef.current)}
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
          >
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '2px' }}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className="ghost transport-step-btn"
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.currentTime = Math.min(videoRef.current.duration || 9999, videoRef.current.currentTime + 1);
                playhead.set(videoRef.current.currentTime);
                redraw();
              }
            }}
            title="Step forward 1s (Right Arrow / L)"
            aria-label="Step forward 1 second"
          >
            <span>+1s</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polygon points="13 19 22 12 13 5 13 19" />
              <polygon points="2 19 11 12 2 5 2 19" />
            </svg>
          </button>
        </div>

        <div className="transport-time-pill" title="Current Playhead / Video Timecode">
          <span className={`time-dot ${playing ? 'live' : ''}`} />
          <span className="clock" ref={clockRef}>
            0:00.00
          </span>
        </div>

        <div className="transport-extras">
          <div className="transport-res-badge" title="Canvas Native Resolution">
            {size.width}×{size.height} {size.height > size.width ? '9:16' : '16:9'}
          </div>

          <button
            type="button"
            className={`transport-safe-btn ${safe ? 'active' : 'ghost'}`}
            aria-pressed={safe}
            onClick={() => setSafe(!safe)}
            title="Toggle TikTok / Reels Safe Zones"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" strokeDasharray="2 2" />
              <line x1="3" y1="15" x2="21" y2="15" strokeDasharray="2 2" />
            </svg>
            <span>Safe zone</span>
          </button>
        </div>
      </div>
    </section>
  );
}

let activePlayPromise: Promise<void> | null = null;

const safePlay = async (el: HTMLVideoElement) => {
  try {
    activePlayPromise = el.play();
    await activePlayPromise;
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      console.warn('Playback error:', err);
    }
  } finally {
    activePlayPromise = null;
  }
};

const safePause = async (el: HTMLVideoElement | null) => {
  if (!el) return;
  if (activePlayPromise) {
    try {
      await activePlayPromise;
    } catch {
      // In-flight play promise cancellation is safely ignored
    }
  }
  el.pause();
};

const previewToggle = async (el: HTMLVideoElement | null) => {
  if (!el) return;
  if (el.paused) {
    await safePlay(el);
  } else {
    await safePause(el);
  }
};
