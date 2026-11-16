import { createSessionToken, registerUser } from '@/server/session';

export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json();
    if (!email || !password) {
      return Response.json({ error: 'Email and password are required.' }, { status: 400 });
    }
    if (password.length < 6) {
      return Response.json({ error: 'Password must be at least 6 characters long.' }, { status: 400 });
    }

    const user = registerUser(email, password, name);
    const token = createSessionToken(user);

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
          'Set-Cookie': `cwaya_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}`,
        },
      }
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Signup failed.' }, { status: 400 });
  }
}
