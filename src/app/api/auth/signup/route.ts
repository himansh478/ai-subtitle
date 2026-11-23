import { createSessionToken, registerUser } from '@/server/session';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';

    if (!email || !EMAIL_REGEX.test(email)) {
      return Response.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return Response.json({ error: 'Password must be at least 6 characters long.' }, { status: 400 });
    }
    if (password.length > 128) {
      return Response.json({ error: 'Password is too long (max 128 characters).' }, { status: 400 });
    }

    const user = registerUser(email, password, name);
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
    return Response.json({ error: error instanceof Error ? error.message : 'Signup failed.' }, { status: 400 });
  }
}
