'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { clearLocalAuth, setLocalAuth, supabase } from '@/lib/auth';

type Mode = 'signin' | 'signup' | 'forgot';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const goBack = () => {
    let target = '/';
    try {
      const search = new URLSearchParams(window.location.search);
      const next = search.get('next');
      if (next && next.startsWith('/')) target = next;
    } catch {
      // fallback to home
    }
    router.push(target);
    router.refresh();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const cleanEmail = email.trim().toLowerCase();

    try {
      if (mode === 'signin') {
        // 1. Try Supabase if configured
        if (supabase) {
          const { error: failed } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
          if (!failed) {
            goBack();
            return;
          }
        }

        // 2. Built-in auth API
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to sign in.');

        setLocalAuth(data.token, data.user);
        goBack();
      } else if (mode === 'signup') {
        // 1. Try Supabase if configured
        if (supabase) {
          const { data, error: failed } = await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: { data: { name: name.trim() } },
          });
          if (!failed && data.session) {
            goBack();
            return;
          }
        }

        // 2. Built-in auth API
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password, name: name.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create account.');

        setLocalAuth(data.token, data.user);
        goBack();
      } else if (mode === 'forgot') {
        if (supabase) {
          await supabase.auth.resetPasswordForEmail(cleanEmail);
        }
        setMessage('If an account exists for this email, password instructions have been sent.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const quickLogin = async (vipEmail: string) => {
    setEmail(vipEmail);
    setPassword('vip123');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: vipEmail, password: 'vip123' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Quick login failed.');
      setLocalAuth(data.token, data.user);
      goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quick login failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Logo and Brand */}
        <Link href="/" className="auth-brand">
          <span className="logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="15" x="2" y="4.5" rx="3" />
              <path d="M7 12h4" />
              <path d="M15 12h2" />
              <path d="M7 16h8" />
            </svg>
          </span>
          <span className="brand-name">Cwaya Captions AI</span>
        </Link>

        {/* Auth Mode Tabs */}
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            className={`auth-tab ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => {
              setMode('signin');
              setError(null);
              setMessage(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => {
              setMode('signup');
              setError(null);
              setMessage(null);
            }}
          >
            Create Account
          </button>
        </div>

        <div className="auth-header">
          <h2>{mode === 'signup' ? 'Start Captioning Like a Pro' : 'Welcome Back'}</h2>
          <p>
            {mode === 'signup'
              ? 'Create your free account to get started with AI subtitles.'
              : 'Sign in to access your video projects and kinetic styles.'}
          </p>
        </div>

        {error && (
          <div className="auth-banner error-banner">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="auth-banner success-banner">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>{message}</span>
          </div>
        )}

        {/* Login / Register Form */}
        <form onSubmit={submit} className="auth-form">
          {mode === 'signup' && (
            <label className="auth-field">
              <span>Full Name</span>
              <input
                type="text"
                placeholder="e.g. Himansh Gour"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </label>
          )}

          <label className="auth-field">
            <span>Email Address</span>
            <input
              type="email"
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label className="auth-field">
            <div className="field-label-row">
              <span>Password</span>
              {mode === 'signin' && (
                <button
                  type="button"
                  className="ghost forgot-link"
                  onClick={() => {
                    setMode('forgot');
                    setError(null);
                  }}
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="password-input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={mode === 'signup' ? 'At least 6 characters' : 'Enter your password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                className="ghost toggle-password-btn"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          <button type="submit" className="primary auth-submit-btn" disabled={busy}>
            {busy ? (
              <span className="btn-spinner" />
            ) : mode === 'signup' ? (
              'Create Account'
            ) : mode === 'forgot' ? (
              'Send Reset Link'
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Quick VIP Login helper */}
        <div className="auth-quick-login">
          <span className="quick-label">Instant 1-Click Access:</span>
          <div className="quick-buttons">
            <button
              type="button"
              className="ghost quick-chip"
              onClick={() => quickLogin('himanshgour7@gmail.com')}
            >
              ⚡ Himansh Gour (VIP)
            </button>
            <button
              type="button"
              className="ghost quick-chip"
              onClick={() => quickLogin('sudhanshugour89@gmail.com')}
            >
              ⚡ Sudhanshu Gour (VIP)
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="auth-footer">
          <Link href="/" className="ghost back-link">
            ← Back to Caption Studio
          </Link>
        </div>
      </div>
    </div>
  );
}
