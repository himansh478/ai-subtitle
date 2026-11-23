'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAccount, minutesLeft } from '@/lib/account';
import { accountsOn } from '@/lib/auth';
import { SCRIPTS } from '@/lib/project';
import { useEditor } from '@/state/editor';
import type { ExportKind } from './ExportDialog';
import { VideoModes } from './VideoModes';

export function TopBar({ onExport }: { onExport: (kind: ExportKind) => void }) {
  const { account } = useAccount();
  const project = useEditor((s) => s.project);
  const script = useEditor((s) => s.doc?.script);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const { undo, redo, setScript } = useEditor.getState();
  const [open, setOpen] = useState(false);
  if (!project) return null;

  const pick = (kind: ExportKind) => {
    setOpen(false);
    onExport(kind);
  };

  return (
    <header className="topbar">
      {/* Back to Projects */}
      <Link href="/" className="topbar-back-btn" title="Back to Projects">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        <span>Projects</span>
      </Link>

      {/* Project Name & Status */}
      <div className="topbar-project-info" title={project.name}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span className="topbar-project-name">{project.name}</span>
        <span className="topbar-saved-badge" title="Changes are automatically saved to your browser">
          <span className="saved-dot" />
          <span>Saved</span>
        </span>
      </div>

      <div className="topbar-divider" />

      {/* History Controls */}
      <div className="topbar-history-group">
        <button
          type="button"
          className="ghost icon-btn"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v6h6"/>
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
          </svg>
        </button>
        <button
          type="button"
          className="ghost icon-btn"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 7v6h-6"/>
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>
          </svg>
        </button>
      </div>

      {/* Framing & Person Modes */}
      <VideoModes />

      <div className="spacer" />

      {/* Language / Script Switcher (English, Hinglish, Hindi) */}
      {SCRIPTS[project.language].length > 1 && (
        <div className="segmented topbar-scripts" role="group" aria-label="Caption language">
          {SCRIPTS[project.language].map((s) => (
            <button
              key={s.id}
              type="button"
              className={s.id === script ? 'on' : ''}
              aria-pressed={s.id === script}
              onClick={() => setScript(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Account & Free Trial Badge */}
      {accountsOn && (
        <div className="topbar-account-group">
          {account && (
            <Link href="/account" className="topbar-trial-badge" title="View Account & Free Trial Minutes">
              <span className="badge-icon">⚡</span>
              <span>
                {account.paidLeft > 0
                  ? `${minutesLeft(account)}m left`
                  : account.freeLeft > 0
                  ? `${Math.max(1, Math.ceil(account.freeLeft / 60))}m Trial`
                  : '0m Left'}
              </span>
            </Link>
          )}
          <Link href="/account" className="ghost topbar-account-link" title="My Account & Usage">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span className="account-text">Account</span>
          </Link>
        </div>
      )}

      {/* Export Menu */}
      <div className="menu">
        <button
          type="button"
          className="primary export-btn"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span>Export</span>
          <svg className={`export-chevron ${open ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {open && (
          <div className="menu-list export-menu-dropdown">
            <button type="button" onClick={() => pick('mp4')} className="export-menu-item">
              <div className="export-menu-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="23 7 16 12 23 17 23 7"/>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
              </div>
              <div className="export-menu-text">
                <b>Video with captions</b>
                <small>MP4 with kinetic subtitles (1080p & 4K, 60fps)</small>
              </div>
            </button>

            <button type="button" onClick={() => pick('overlay')} className="export-menu-item">
              <div className="export-menu-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </div>
              <div className="export-menu-text">
                <b>Transparent captions overlay</b>
                <small>MOV with alpha channel for Premiere Pro / After Effects</small>
              </div>
            </button>

            <button type="button" onClick={() => pick('srt')} className="export-menu-item">
              <div className="export-menu-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <div className="export-menu-text">
                <b>Subtitle file (SRT)</b>
                <small>Clean word-timed SRT for YouTube & social platforms</small>
              </div>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
