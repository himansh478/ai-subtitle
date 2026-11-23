import { authenticateUser, createSessionToken } from '@/server/session';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      return Response.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const user = authenticateUser(email, password);
    const token = createSessionToken(user);

    const isProd = process.env.NODE_ENV === 'production';
    const cookieFlags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${isProd ? '; Secure' : ''}`;

    return Response.json(
      {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          watermark: user.watermark,
          freeSecondsLeft: user.freeSecondsLeft,
          paidSecondsLeft: user.paidSecondsLeft,
        },
      },
      {
        headers: {
          'Set-Cookie': `cwaya_session=${token}; ${cookieFlags}`,
        },
      }
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Login failed.' }, { status: 401 });
  }
}
