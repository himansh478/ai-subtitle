'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { CaptionList } from '@/components/CaptionList';
import { ExportDialog, type ExportKind } from '@/components/ExportDialog';
import { Preview, type PreviewHandle } from '@/components/Preview';
import { StylePanel } from '@/components/StylePanel';
import { Timeline } from '@/components/Timeline';
import { TopBar } from '@/components/TopBar';
import { buildCaptions } from '@/engine/group';
import { outputSize } from '@/engine/export';
import { useAccount } from '@/lib/account';
import { accountsOn } from '@/lib/auth';
import { useAutosave } from '@/lib/autosave';
import { loadProject, readMedia, saveProject } from '@/lib/storage';
import { newerCloudEdits } from '@/lib/sync';
import { useEditor } from '@/state/editor';
import { playhead } from '@/state/playhead';

/**
 * Mobile pe preview canvas zyada chhota render karte hain — fast draw hota hai.
 * Export always happens at full 1080p (outputSize), sirf live preview scale hota hai.
 */
function previewSize(media: { width: number; height: number }, reframe: boolean) {
  const full = outputSize(media, reframe);
  if (typeof window === 'undefined') return full;
  // Mobile: screen width se bada nahi hona chahiye, 540p max
  const isMobile = window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if (!isMobile) return full;
  const maxShort = 540;
  const short = Math.min(full.width, full.height);
  if (short <= maxShort) return full;
  const scale = maxShort / short;
  const even = (n: number) => Math.round((n * scale) / 2) * 2;
  return { width: even(full.width), height: even(full.height) };
}

export default function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { ready, signedIn, account } = useAccount();
  const load = useEditor((s) => s.load);
  const setWatermark = useEditor((s) => s.setWatermark);
  const project = useEditor((s) => s.project);
  const doc = useEditor((s) => s.doc);
  const notice = useEditor((s) => s.notice);
  const setNotice = useEditor((s) => s.setNotice);
  const previewRef = useRef<PreviewHandle>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [mobileTab, setMobileTab] = useState<'captions' | 'style' | 'timeline'>('captions');

  useEffect(() => {
    Promise.all([loadProject(id), readMedia(id, 'source')])
      .then(async ([loaded, file]) => {
        const newer = await newerCloudEdits(loaded);
        const latest = newer ? await saveProject({ ...loaded, doc: newer.doc, faces: newer.faces ?? loaded.faces }) : loaded;
        load(latest);
        if (newer) setNotice('Updated with your edits from another device.');
        setVideo(file);
      })
      .catch(() => setFailed(true));
  }, [id, load, setNotice]);

  useEffect(() => {
    if (accountsOn && ready && !signedIn) router.replace(`/login?next=/studio/${id}`);
  }, [ready, signedIn, router, id]);

  // Until the account says otherwise the mark stays on, so nobody exports without it by luck.
  useEffect(() => setWatermark(accountsOn && (account?.watermark ?? true)), [account, setWatermark]);

  useAutosave();

  const captions = useMemo(() => (doc ? buildCaptions(doc) : []), [doc]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (/^(TEXTAREA|INPUT|SELECT)$/.test(target.tagName)) return;
      const { undo, redo, splitCaption } = useEditor.getState();
      const preview = previewRef.current;
      if (e.code === 'Space') {
        e.preventDefault();
        preview?.toggle();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        preview?.step(e.key === 'ArrowLeft' ? -1 : 1, e.shiftKey ? 30 : 1);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
        const time = playhead.get();
        const caption = captions.find((c) => time >= c.words[0].start && time < c.words[c.words.length - 1].end);
        const index = caption?.words.findIndex((w) => w.start >= time) ?? -1;
        if (caption && index > 0) splitCaption(caption.id, index);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [captions]);

  if (failed) {
    return (
      <main className="home">
        <h1>Project not found</h1>
        <p className="lead">It may have been deleted, or browser data may have been cleared.</p>
        <Link href="/">Back to your projects</Link>
      </main>
    );
  }
  if (!project || !doc || !video) return <main className="home">Opening project…</main>;

  const size = previewSize(project.media, !!doc.reframe);

  return (
    <>
      <div className={`studio mobile-tab-${mobileTab}`}>
        <TopBar onExport={setExporting} />
        <div className="mobile-tab-bar" role="tablist" aria-label="Studio View Selector">
          <button
            role="tab"
            type="button"
            aria-selected={mobileTab === 'captions'}
            className={mobileTab === 'captions' ? 'active' : ''}
            onClick={() => setMobileTab('captions')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Captions
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={mobileTab === 'style'}
            className={mobileTab === 'style' ? 'active' : ''}
            onClick={() => setMobileTab('style')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="m4.93 4.93 4.24 4.24"/>
            </svg>
            Styles
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={mobileTab === 'timeline'}
            className={mobileTab === 'timeline' ? 'active' : ''}
            onClick={() => setMobileTab('timeline')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Timeline
          </button>
        </div>
        <CaptionList captions={captions} seek={(t) => previewRef.current?.seek(t)} />
        <Preview key={doc.reframe ? 'vertical' : 'original'} ref={previewRef} video={video} captions={captions} size={size} />
        <StylePanel seek={(t) => previewRef.current?.seek(t)} />
        <Timeline captions={captions} seek={(t) => previewRef.current?.seek(t)} />
      </div>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button className="ghost" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}
      {exporting && previewRef.current && (
        <ExportDialog kind={exporting} captions={captions} preview={previewRef.current} onClose={() => setExporting(null)} />
      )}
    </>
  );
}
