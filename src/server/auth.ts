import { accountsOn, admin } from './supabase';
import { verifySessionToken } from './session';

export type Viewer = { id: string; email: string | null };

const LOCAL_VIEWER: Viewer = { id: 'local', email: null };
const TEAM_ONLY = 'Cwaya Captions is open to the Cwaya team only for now.';

/** Signed in, but not on the team list. */
const outsiders = new WeakSet<Request>();

/** While the app is open to the team only, ALLOWED_EMAILS lists who may use it. Unset means everyone. */
function onTeam(email: string | null) {
  const team = (process.env.ALLOWED_EMAILS ?? '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  return team.length === 0 || (!!email && team.includes(email.toLowerCase()));
}

function parseCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

/** Who sent this request, checked with built-in JWT or Supabase. */
export async function viewerOf(request: Request): Promise<Viewer | null> {
  const authHeader = request.headers.get('authorization')?.replace(/^Bearer /i, '');
  const cookieToken = parseCookie(request.headers.get('cookie'), 'cwaya_session');
  const token = authHeader || cookieToken;

  // 1. Check built-in session JWT
  if (token) {
    const claims = verifySessionToken(token);
    if (claims) {
      if (!onTeam(claims.email)) {
        outsiders.add(request);
        return null;
      }
      return { id: claims.sub, email: claims.email };
    }
  }

  // 2. Check Supabase session if configured
  if (accountsOn() && token) {
    try {
      const { data, error } = await admin().auth.getUser(token);
      if (!error && data?.user) {
        const email = data.user.email ?? null;
        if (!onTeam(email)) {
          outsiders.add(request);
          return null;
        }
        return { id: data.user.id, email };
      }
    } catch {
      // Fall through
    }
  }

  // 3. Fallback for local development if not signed in
  if (process.env.NODE_ENV === 'development') {
    return LOCAL_VIEWER;
  }

  return null;
}

// Someone signed in but not let in hears why, and keeps their session: a 401 would sign them out.
export const signInRequired = (request: Request) =>
  outsiders.has(request) ? Response.json({ error: TEAM_ONLY }, { status: 403 }) : Response.json({ error: 'Please sign in.' }, { status: 401 });
