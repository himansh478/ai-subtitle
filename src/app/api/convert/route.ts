import { signInRequired, viewerOf } from '@/server/auth';
import { convert } from '@/server/convert';

const MOST_WORDS = 2000;

// Respells edited words into the other scripts.
export async function POST(request: Request) {
  if (!(await viewerOf(request))) return signInRequired();
  const { words } = (await request.json()) as { words: string[] };
  if (!words?.length || words.length > MOST_WORDS) return Response.json({ error: 'Bad request' }, { status: 400 });

  try {
    return Response.json({ converted: await convert(words) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Language step failed' }, { status: 502 });
  }
}
