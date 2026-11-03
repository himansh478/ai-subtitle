import { signInRequired, viewerOf } from '@/server/auth';
import { accountHistory, accountState } from '@/server/billing';
import { FREE_MINUTES } from '@/lib/plans';
import { paymentsOn } from '@/server/razorpay';
import { accountsOn } from '@/server/supabase';

export async function GET(request: Request) {
  const viewer = await viewerOf(request);
  if (!viewer) return signInRequired();
  if (!accountsOn()) return Response.json({ error: 'Accounts are off.' }, { status: 404 });

  const [state, history] = await Promise.all([accountState(viewer.id), accountHistory(viewer.id)]);
  return Response.json({ email: viewer.email, freeMinutes: FREE_MINUTES, paymentsReady: paymentsOn(), ...state, ...history });
}
