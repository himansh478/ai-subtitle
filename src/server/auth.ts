import { accountsOn, admin } from './supabase';

export type Viewer = { id: string; email: string | null };

const LOCAL_VIEWER: Viewer = { id: 'local', email: null };

/** Who sent this request, checked with Supabase. Null means not signed in. */
export async function viewerOf(request: Request): Promise<Viewer | null> {
  // Local mode exists for development. A deployed app with no accounts stays locked.
  if (!accountsOn()) return process.env.NODE_ENV === 'development' ? LOCAL_VIEWER : null;

  const token = request.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!token) return null;

  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export const signInRequired = () => Response.json({ error: 'Please sign in.' }, { status: 401 });
