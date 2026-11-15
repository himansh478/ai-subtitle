'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type DragEvent } from 'react';
import { CaptionShowcase } from '@/components/CaptionShowcase';
import { VocabularyField } from '@/components/VocabularyField';
import { useAccount, minutesLeft } from '@/lib/account';
import { accountsOn, supabase } from '@/lib/auth';
import { browserProblem } from '@/lib/browser';
import { createProject, OutOfMinutes, type Stage } from '@/lib/ingest';
import type { Project } from '@/lib/project';
import { deleteProject, listProjects, readMedia } from '@/lib/storage';
import { deleteCloudProject, listCloudProjects, restoreProject, type CloudProject } from '@/lib/sync';

const STAGES: { id: Stage; label: string; desc: string; icon: string }[] = [
  { id: 'reading', label: 'Extracting Video & Audio', desc: 'Fast local WebCodecs demuxing in browser', icon: '📂' },
  { id: 'transcribing', label: 'Whisper Speech Recognition', desc: 'Auto-detecting English, Hinglish, & Hindi', icon: '🎙️' },
  { id: 'converting', label: 'Gemini Language Refinement', desc: 'WhatsApp-style Hinglish spelling & proofreading', icon: '✍️' },
  { id: 'aligning', label: 'Frame-Accurate Alignment', desc: 'Deriving ±30ms word timestamps on GPU worker', icon: '🎯' },
];

const seconds = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const AGES: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86400000],
  ['hour', 3600000],
  ['minute', 60000],
];

function edited(time: number) {
  const age = Date.now() - time;
  const [unit, size] = AGES.find(([, length]) => age >= length) ?? ['minute', 60000];
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-Math.floor(age / size), unit);
}

export default function Home() {
  const router = useRouter();
  const { ready, signedIn, account, refresh } = useAccount();
  const [projects, setProjects] = useState<Project[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [cloud, setCloud] = useState<CloudProject[]>([]);
  const [stage, setStage] = useState<Stage | null>(null);
  const [fraction, setFraction] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [needsMinutes, setNeedsMinutes] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setProblem(browserProblem());
    listProjects().then(setProjects);
  }, []);

  useEffect(() => {
    for (const { id } of projects) {
      readMedia(id, 'thumb')
        .then((file) => setThumbs((known) => (known[id] ? known : { ...known, [id]: URL.createObjectURL(file) })))
        .catch(() => {});
    }
  }, [projects]);

  useEffect(() => {
    if (signedIn) listCloudProjects().then(setCloud).catch(() => {});
  }, [signedIn]);

  const start = async (file?: File) => {
    if (!file) return;
    setError(null);
    setNeedsMinutes(false);
    try {
      const id = await createProject(file, (next, part) => {
        setStage(next);
        setFraction(part);
      });
      router.push(`/studio/${id}`);
    } catch (e) {
      setStage(null);
      setNeedsMinutes(e instanceof OutOfMinutes);
      setError(e instanceof Error ? e.message : 'Something went wrong while processing video.');
      refresh();
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    await deleteProject(id).catch(() => {});
    await deleteCloudProject(id).catch(() => {});
    setProjects((list) => list.filter((p) => p.id !== id));
    setCloud((list) => list.filter((p) => p.id !== id));
  };

  const restore = async (row: CloudProject, file?: File) => {
    if (!file) return;
    setError(null);
    try {
      await restoreProject(row, file);
      router.push(`/studio/${row.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open this project.");
    }
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    start(e.dataTransfer.files[0]);
  };

  const now = stage ? STAGES.findIndex((s) => s.id === stage) : -1;
  const locked = accountsOn && !signedIn;
  const elsewhere = cloud.filter((row) => !projects.some((p) => p.id === row.id));

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  return (
    <div className="app-shell">
      {/* Top Navigation Bar */}
      <header className="navbar">
        <div className="navbar-container">
          <Link href="/" className="brand-logo">
            <span className="logo-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="15" x="2" y="4.5" rx="3" />
                <path d="M7 12h4" />
                <path d="M15 12h2" />
                <path d="M7 16h8" />
              </svg>
            </span>
            <div className="brand-text">
              <span className="brand-name">Cwaya</span>
              <span className="brand-tag">Captions AI</span>
            </div>
            <span className="badge-pill beta">Studio v2.4</span>
          </Link>

          <nav className="nav-links">
            <a href="#upload-section" className="nav-link active">Create Captions</a>
            <a href="#projects-section" className="nav-link">
              My Projects {projects.length > 0 && <span className="nav-count">{projects.length}</span>}
            </a>
            <a href="#styles-section" className="nav-link">Styles</a>
          </nav>

          <div className="nav-actions">
            <div className="engine-status" title="Local Whisper and Gemini forced alignment workers active">
              <span className="status-dot pulse" />
              <span>AI Engine Ready</span>
            </div>

            {accountsOn && ready ? (
              signedIn ? (
                <div className="user-menu">
                  {account && (
                    <Link href="/account" className="credits-badge" id="minutes-left">
                      <span className="credits-icon">⚡</span>
                      <span>{minutesLeft(account)} mins left</span>
                    </Link>
                  )}
                  <button className="ghost sign-out-btn" onClick={() => supabase?.auth.signOut()}>
                    Sign out
                  </button>
                </div>
              ) : (
                <Link href="/login">
                  <button className="primary sign-in-btn">Sign in</button>
                </Link>
              )
            ) : (
              <span className="local-mode-chip" title="Running with local backend & unlimited processing">
                ⚡ Pro Local Mode
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-pill">
            <span className="sparkle">✨</span>
            <span>Next-Gen Word-Level Video Captioning</span>
          </div>

          <h1 className="hero-title">
            Turn Any Video into <span className="gradient-text">Viral Reels</span> with Dynamic AI Captions
          </h1>

          <p className="hero-subtitle">
            Word-perfect forced alignment (±30ms), auto-detected Hinglish, Hindi & English speech,
            and trending kinetic styles. <strong>Your video never leaves your device.</strong>
          </p>

          <div className="hero-pills">
            <span className="feature-pill">⚡ Frame-Accurate (±30ms)</span>
            <span className="feature-pill">🇮🇳 Hindi & Hinglish WhatsApp-Spelling</span>
            <span className="feature-pill">🎨 60 FPS Export & 4K Crisp Text</span>
            <span className="feature-pill">🔒 100% Private (On-Device Video)</span>
          </div>
        </section>

        {problem && (
          <div className="banner error-banner">
            <span className="banner-icon">⚠️</span>
            <span>{problem}</span>
          </div>
        )}

        {/* Upload & Generator Card */}
        <section id="upload-section" className="upload-container">
          {locked ? (
            ready && (
              <div className="card auth-prompt-card">
                <div className="auth-icon-wrap">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <h3>Sign in to generate captions</h3>
                <p>Use your Cwaya account to unlock automatic transcription and forced alignment.</p>
                <Link href="/login">
                  <button className="primary sign-in-cta">Sign in to Continue</button>
                </Link>
              </div>
            )
          ) : stage ? (
            <div className="card processing-card" aria-live="polite">
              <div className="processing-header">
                <div className="processing-title-row">
                  <div className="spinner" />
                  <div>
                    <h3>Generating Your Captions</h3>
                    <p className="notice-line">Analyzing speech audio and computing word timing...</p>
                  </div>
                </div>
                {fraction !== undefined && (
                  <span className="fraction-badge">{Math.round(fraction * 100)}%</span>
                )}
              </div>

              {fraction !== undefined && (
                <div className="progress-bar-container">
                  <div className="progress-bar-fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
                </div>
              )}

              <div className="stepper-grid">
                {STAGES.map((s, i) => {
                  const isCurrent = i === now;
                  const isPast = i < now;
                  return (
                    <div
                      key={s.id}
                      className={`stepper-card ${isCurrent ? 'active' : ''} ${isPast ? 'completed' : ''}`}
                    >
                      <div className="step-icon-col">
                        <span className="step-icon">{isPast ? '✓' : s.icon}</span>
                      </div>
                      <div className="step-content">
                        <span className="step-label">{s.label}</span>
                        <span className="step-desc">{s.desc}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="processing-footer">
                <span>🔒 Privacy protected: Video frames are decoded in your browser. Only audio is sent to the AI.</span>
              </div>
            </div>
          ) : (
            <div className="upload-wrapper">
              <label
                className={`dropzone ${over ? 'drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={drop}
              >
                <input id="file" type="file" accept="video/*" onChange={(e) => start(e.target.files?.[0])} />

                <div className="dropzone-glow" />

                <div className="dropzone-content">
                  <div className="upload-icon-circle">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>

                  <div className="dropzone-texts">
                    <span className="dropzone-title">Drop your video here, or click to upload</span>
                    <span className="dropzone-subtitle">MP4, MOV, or WebM clips up to 60 seconds (1080p & 4K supported)</span>
                  </div>

                  <button type="button" className="primary upload-btn" onClick={() => document.getElementById('file')?.click()}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Choose Video File
                  </button>

                  <div className="privacy-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    <span>100% Private — Video stays in your browser; only lightweight audio is extracted.</span>
                  </div>
                </div>
              </label>

              {/* Creator Vocabulary tuning */}
              {!stage && !locked && <VocabularyField />}
            </div>
          )}

          {error && (
            <div className="banner error-banner">
              <span className="banner-icon">⚠️</span>
              <div>
                <strong>Processing failed</strong>
                <p>{error}</p>
                {needsMinutes && (
                  <Link href="/account" className="upgrade-link">
                    Upgrade account or get more minutes →
                  </Link>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Trending Preset Styles Showcase */}
        <div id="styles-section">
          <CaptionShowcase />
        </div>

        {/* Project Workspace Grid */}
        <section id="projects-section" className="projects-workspace">
          <div className="workspace-header">
            <div className="workspace-title-row">
              <h2 className="section-title">Your Projects</h2>
              <span className="badge-pill">{projects.length} Saved</span>
            </div>

            {projects.length > 1 && (
              <div className="search-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>
            )}
          </div>

          {projects.length > 0 ? (
            <div className="projects-grid">
              {filteredProjects.map((p) => (
                <div className="project-card" key={p.id}>
                  <Link href={`/studio/${p.id}`} className="project-thumb-container">
                    {thumbs[p.id] ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={thumbs[p.id]} alt={p.name} className="project-thumb" />
                    ) : (
                      <div className="project-thumb-placeholder">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </div>
                    )}
                    <div className="play-overlay">
                      <div className="play-circle">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </div>
                    </div>
                    <span className="duration-chip">{seconds(p.media.duration)}</span>
                  </Link>

                  <div className="project-card-body">
                    <div className="project-meta">
                      <b className="project-card-name" title={p.name}>{p.name}</b>
                      <small className="project-card-time">Edited {edited(p.updatedAt)}</small>
                    </div>

                    <div className="project-card-actions">
                      <Link href={`/studio/${p.id}`} className="open-btn">
                        Open Studio
                      </Link>
                      <button
                        type="button"
                        className="ghost delete-btn"
                        onClick={() => remove(p.id, p.name)}
                        title="Delete project"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-projects-card">
              <div className="empty-icon-wrap">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="m22 8-6 4 6 4V8Z" />
                  <rect width="14" height="12" x="2" y="6" rx="2" />
                </svg>
              </div>
              <h3>No projects yet</h3>
              <p>Upload a video above to generate word-perfect captions and apply trending kinetic styles.</p>
            </div>
          )}

          {/* Cloud Synced Projects from Other Devices */}
          {elsewhere.length > 0 && (
            <div className="cloud-section">
              <h3 className="cloud-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
                </svg>
                Saved on Your Other Devices
              </h3>
              <div className="cloud-grid">
                {elsewhere.map((row) => (
                  <div className="cloud-card" key={row.id}>
                    <div className="cloud-info">
                      <b>{row.name}</b>
                      <small>Captions are safely synced. Select your local video to open.</small>
                    </div>
                    <div className="cloud-actions">
                      <label className="pick-file-btn">
                        Choose Video
                        <input type="file" accept="video/*" onChange={(e) => restore(row, e.target.files?.[0])} />
                      </label>
                      <button className="ghost delete-btn" onClick={() => remove(row.id, row.name)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Pro Tips & Keyboard Shortcuts Footer */}
        <footer className="home-footer">
          <div className="footer-tips">
            <span className="tip-label">Keyboard Shortcuts in Studio:</span>
            <span className="kbd-pill"><kbd>Space</kbd> Play / Pause</span>
            <span className="kbd-pill"><kbd>S</kbd> Split Word / Caption</span>
            <span className="kbd-pill"><kbd>Ctrl+Z</kbd> Undo</span>
            <span className="kbd-pill"><kbd>← / →</kbd> Frame Step</span>
          </div>
          <div className="footer-credits">
            <span>Cwaya Captions Studio • Powered by Whisper, Google Gemini & Modal GPU Alignment</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
