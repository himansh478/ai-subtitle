'use client';

import { useEffect, useState } from 'react';
import { readVocabulary, saveVocabulary } from '@/lib/vocabulary';

const SUGGESTIONS = ['Cwaya', 'Hinglish', 'Sehore', 'Reels', 'YouTube', 'Vlog', 'Bhai'];

/** Names and brands to spell exactly. Applied to new uploads and to proofreading. */
export function VocabularyField() {
  const [words, setWords] = useState<string[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setWords(readVocabulary());
  }, []);

  const updateWords = (next: string[]) => {
    const cleaned = Array.from(new Set(next.map((w) => w.trim()).filter(Boolean)));
    setWords(cleaned);
    saveVocabulary(cleaned);
  };

  const addWord = (word: string) => {
    const trimmed = word.trim();
    if (!trimmed || words.includes(trimmed)) return;
    updateWords([...words, trimmed]);
    setInputVal('');
  };

  const removeWord = (word: string) => {
    updateWords(words.filter((w) => w !== word));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addWord(inputVal);
    }
  };

  return (
    <div className="vocab-card">
      <div className="vocab-header" onClick={() => setOpen(!open)}>
        <div className="vocab-title-wrap">
          <div className="vocab-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
              <path d="M6 6h10"/>
              <path d="M6 10h10"/>
            </svg>
          </div>
          <div>
            <div className="vocab-title">
              Smart Vocabulary & Brand Names
              {words.length > 0 && <span className="vocab-badge">{words.length} active</span>}
            </div>
            <p className="vocab-desc">
              Whisper & Gemini will spell these brand names, creator tags, and local Hindi terms accurately.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="ghost vocab-toggle"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          {open ? 'Hide' : 'Configure'}
          <svg className={`chevron ${open ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="vocab-body">
          <div className="vocab-input-row">
            <input
              type="text"
              id="vocabulary"
              placeholder="Type word or brand name and press Enter..."
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              className="vocab-input"
            />
            <button
              type="button"
              className="primary"
              onClick={() => addWord(inputVal)}
              disabled={!inputVal.trim()}
            >
              Add Word
            </button>
          </div>

          {words.length > 0 ? (
            <div className="vocab-tags">
              {words.map((w) => (
                <span key={w} className="vocab-tag">
                  {w}
                  <button type="button" onClick={() => removeWord(w)} title={`Remove ${w}`} className="tag-remove">
                    ×
                  </button>
                </span>
              ))}
              <button
                type="button"
                className="ghost vocab-clear-all"
                onClick={() => updateWords([])}
              >
                Clear all
              </button>
            </div>
          ) : (
            <p className="vocab-empty">No custom words added yet. Add creator names, Hindi slang, or brand names above.</p>
          )}

          <div className="vocab-suggestions">
            <span className="vocab-suggestions-label">Quick suggestions:</span>
            {SUGGESTIONS.filter((s) => !words.includes(s)).map((s) => (
              <button
                key={s}
                type="button"
                className="vocab-chip"
                onClick={() => addWord(s)}
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
