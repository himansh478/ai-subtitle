import { findUserById, verifySessionToken } from '@/server/session';

function parseCookieToken(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/cwaya_session=([^;]+)/);
  return match ? match[1] : null;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')?.replace(/^Bearer /i, '');
  const cookieToken = parseCookieToken(request.headers.get('cookie'));
  const token = authHeader || cookieToken;

  if (!token) {
    return Response.json({ user: null }, { status: 200 });
  }

  const claims = verifySessionToken(token);
  if (!claims) {
    return Response.json({ user: null }, { status: 200 });
  }

  const record = findUserById(claims.sub);
  if (!record) {
    return Response.json({ user: null }, { status: 200 });
  }

  return Response.json({
    user: {
      id: record.id,
      email: record.email,
      name: record.name,
      watermark: record.watermark,
      freeSecondsLeft: record.freeSecondsLeft,
      paidSecondsLeft: record.paidSecondsLeft,
    },
  });
}
