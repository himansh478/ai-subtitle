import { signInRequired, viewerOf } from '@/server/auth';
import { accountHistory, accountState } from '@/server/billing';
import { FREE_MINUTES } from '@/lib/plans';
import { paymentsOn } from '@/server/razorpay';
import { accountsOn } from '@/server/supabase';
import { findUserByEmail, findUserById } from '@/server/session';

const NO_WATERMARK_EMAILS = [
  'sudhanshugour89@gmail.com',
  'himanshgour7@gmail.com',
];

export async function GET(request: Request) {
  const viewer = await viewerOf(request);
  if (!viewer) return signInRequired(request);

  const isVip = !!viewer.email && NO_WATERMARK_EMAILS.includes(viewer.email.toLowerCase());

  if (!accountsOn()) {
    const user = viewer.email ? findUserByEmail(viewer.email) : findUserById(viewer.id);
    return Response.json({
      email: viewer.email,
      freeMinutes: FREE_MINUTES,
      freeLeft: user ? user.freeSecondsLeft : FREE_MINUTES * 60,
      paidLeft: user ? user.paidSecondsLeft : 0,
      paidUntil: null,
      watermark: user ? user.watermark : false,
      paymentsReady: paymentsOn(),
      usage: [],
      orders: [],
    });
  }

  try {
    const [state, history] = await Promise.all([accountState(viewer.id), accountHistory(viewer.id)]);
    const watermark = isVip ? false : state.watermark;
    return Response.json({ email: viewer.email, freeMinutes: FREE_MINUTES, paymentsReady: paymentsOn(), ...state, watermark, ...history });
  } catch {
    return Response.json({
      email: viewer.email,
      freeMinutes: FREE_MINUTES,
      freeLeft: FREE_MINUTES * 60,
      paidLeft: 0,
      paidUntil: null,
      watermark: !isVip,
      paymentsReady: paymentsOn(),
      usage: [],
      orders: [],
    });
  }
}
