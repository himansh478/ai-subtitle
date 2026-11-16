'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { captionEnd, captionStart, type Caption } from '@/engine/types';
import { tokenText } from '@/lib/project';
import { realignPending, syncScripts } from '@/lib/realign';
import { useEditor } from '@/state/editor';
import { playhead } from '@/state/playhead';

const LOW_SCORE = 0.15;

const stamp = (t: number) => {
  const m = Math.floor(t / 60);
  return `${m}:${(t % 60).toFixed(2).padStart(5, '0')}`;
};

type RowProps = {
  caption: Caption;
  active: boolean;
  hasNext: boolean;
  doubtful: string;
  seek: (t: number) => void;
};

const wordsKey = (caption: Caption) =>
  caption.words.map((w) => `${w.text}|${w.start}|${w.end}|${w.style ? 1 : 0}`).join('~');

// Memoized row view for fast 60fps scrolling
const Row = memo(
  RowView,
  (a, b) =>
    a.active === b.active &&
    a.hasNext === b.hasNext &&
    a.doubtful === b.doubtful &&
    a.caption.id === b.caption.id &&
    wordsKey(a.caption) === wordsKey(b.caption)
);

const tokenIds = (caption: Caption) => caption.words.flatMap((w) => (w.tokenId ? [w.tokenId] : []));

function RowView({ caption, active, hasNext, doubtful, seek }: RowProps) {
  const text = caption.words.map((w) => w.text).join(' ');
  const [draft, setDraft] = useState(text);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const { editCaption, splitCaption, mergeWithNext, deleteCaption, selectToken, markChecked } = useEditor.getState();
  const selected = useEditor((s) => (active ? s.selectedToken : null));

  useEffect(() => setDraft(text), [text]);

  useEffect(() => {
    if (active && document.activeElement !== areaRef.current) {
      rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [active]);

  const save = () => {
    if (draft.trim() === text) return;
    if (!draft.trim()) {
      setDraft(text);
      return;
    }
    markChecked(tokenIds(caption));
    editCaption(caption.id, draft);
    realignPending();
    syncScripts();
  };

  const split = () => {
    const cursor = areaRef.current?.selectionStart ?? 0;
    const index = draft.slice(0, cursor).trim().split(/\s+/).filter(Boolean).length;
    splitCaption(caption.id, Math.min(index || 1, caption.words.length - 1));
  };

  return (
    <div className={`row ${active ? 'active' : ''}`} ref={rowRef}>
      <div className="row-head">
        <button
          type="button"
          className="time-badge"
          onClick={() => seek(captionStart(caption) + 0.001)}
          title="Click to jump playhead here"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <span>{stamp(captionStart(caption))} – {stamp(captionEnd(caption))}</span>
        </button>

        <div className="row-actions">
          <button
            type="button"
            className="ghost row-action-btn"
            onClick={split}
            disabled={caption.words.length < 2 || !caption.words[0].tokenId}
            title="Split caption at text cursor (or press S)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
            </svg>
            Split
          </button>

          <button
            type="button"
            className="ghost row-action-btn"
            onClick={() => mergeWithNext(caption.id)}
            disabled={!hasNext || !caption.words[0].tokenId}
            title="Merge with next caption line"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
            </svg>
            Merge
          </button>

          <button
            type="button"
            className="ghost row-action-btn delete"
            onClick={() => deleteCaption(caption.id)}
            disabled={!caption.words[0].tokenId}
            title="Delete this caption line"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <textarea
        ref={areaRef}
        rows={1}
        value={draft}
        aria-label={`Caption at ${stamp(captionStart(caption))}`}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => seek(captionStart(caption) + 0.001)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') {
            setDraft(text);
            e.currentTarget.blur();
          }
        }}
        className="caption-textarea"
        placeholder="Type caption text here..."
      />

      {active && caption.words[0].tokenId && (
        <div className="chips-container">
          <span className="chips-label">Click word to customize:</span>
          <div className="chips" role="group" aria-label="Style one word">
            {caption.words.map((word) => (
              <button
                key={word.tokenId}
                type="button"
                className={`word-chip ${word.tokenId === selected ? 'on' : ''} ${word.style ? 'styled' : ''}`}
                aria-pressed={word.tokenId === selected}
                onClick={() => selectToken(word.tokenId === selected ? null : (word.tokenId ?? null))}
                title={word.style ? 'Custom styled word (click to edit)' : 'Click to customize font/color/size'}
              >
                {word.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {doubtful && (
        <div className="check">
          <span className="check-text">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Review AI spelling: <strong>{doubtful}</strong>
          </span>
          <button type="button" className="ghost check-btn" onClick={() => markChecked(tokenIds(caption))}>
            Looks right ✓
          </button>
        </div>
      )}
    </div>
  );
}

export function CaptionList({ captions, seek }: { captions: Caption[]; seek: (t: number) => void }) {
  const gaps = useEditor((s) => s.project?.speechGaps ?? []);
  const tokens = useEditor((s) => s.doc?.tokens);
  const script = useEditor((s) => s.doc?.script);
  const [filterQuery, setFilterQuery] = useState('');

  const doubts = useMemo(() => {
    const low = new Map<string, string>();
    if (!tokens || !script || script === 'translated') return low;
    const byId = new Map(tokens.map((t) => [t.id, t]));
    const compared = tokens.some((t) => t.unsure !== undefined);
    for (const caption of captions) {
      const words = caption.words.flatMap((w) => {
        const token = w.tokenId ? byId.get(w.tokenId) : undefined;
        const doubt = token && (compared ? token.unsure : token.score < LOW_SCORE);
        return doubt ? [tokenText(token, script)] : [];
      });
      if (words.length) low.set(caption.id, words.join(', '));
    }
    return low;
  }, [tokens, script, captions]);

  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const update = (time: number) => {
      const current = captions.find((c) => time >= captionStart(c) && time < captionEnd(c));
      setActiveId(current?.id ?? null);
    };
    update(playhead.get());
    return playhead.subscribe(update);
  }, [captions]);

  const nextDoubt = () => {
    const flagged = captions.filter((c) => doubts.has(c.id));
    const after = flagged.find((c) => captionStart(c) > playhead.get() + 0.01) ?? flagged[0];
    if (after) seek(captionStart(after) + 0.001);
  };

  const filteredCaptions = filterQuery.trim()
    ? captions.filter((c) =>
        c.words
          .map((w) => w.text)
          .join(' ')
          .toLowerCase()
          .includes(filterQuery.toLowerCase())
      )
    : captions;

  return (
    <aside className="list">
      <div className="list-head">
        <div className="list-title-wrap">
          <span className="list-title">Captions</span>
          <span className="list-count-badge">{captions.length}</span>
        </div>

        {doubts.size > 0 ? (
          <button type="button" id="next-check" className="check-doubt-btn" onClick={nextDoubt} title="Jump to next word needing review">
            Review {doubts.size}
          </button>
        ) : (
          <span className="all-clear">✓ All verified</span>
        )}
      </div>

      {/* Quick Search across captions */}
      {captions.length > 5 && (
        <div className="list-search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search spoken words..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="list-search-input"
          />
          {filterQuery && (
            <button type="button" className="ghost clear-search-btn" onClick={() => setFilterQuery('')}>
              ×
            </button>
          )}
        </div>
      )}

      {gaps.map((gap) => (
        <div className="gap-warning" key={gap.start}>
          <div className="gap-warning-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Possible speech gap ({stamp(gap.start)} – {stamp(gap.end)})</span>
          </div>
          <button type="button" onClick={() => seek(gap.start)}>Listen to this part</button>
        </div>
      ))}

      <div className="rows">
        {filteredCaptions.map((caption, i) => (
          <Row
            key={caption.id}
            caption={caption}
            active={caption.id === activeId}
            hasNext={i < captions.length - 1}
            doubtful={doubts.get(caption.id) ?? ''}
            seek={seek}
          />
        ))}
      </div>
    </aside>
  );
}
