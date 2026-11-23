import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;
// Accounts & login are always enabled
export const accountsOn = true;

const TOKEN_KEY = 'cwaya_auth_token';
const USER_KEY = 'cwaya_auth_user';

export function getLocalToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getLocalUser(): { id: string; email: string; name: string } | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setLocalAuth(token: string, user: { id: string; email: string; name: string }) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event('cwaya-auth-change'));
}

export function clearLocalAuth() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event('cwaya-auth-change'));
}

export async function signOut() {
  clearLocalAuth();
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {}
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {}
  }
  if (typeof window !== 'undefined') {
    window.location.href = '/';
  }
}

/** A request to this app's own API, as the person signed in. */
export async function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);

  // 1. Check Supabase session
  if (supabase) {
    const session = (await supabase.auth.getSession()).data.session;
    if (session) {
      headers.set('Authorization', `Bearer ${session.access_token}`);
      return fetch(path, { ...init, headers });
    }
  }

  // 2. Check local JWT token
  const token = getLocalToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(path, { ...init, headers });
}
