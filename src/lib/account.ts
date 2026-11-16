import { useCallback, useEffect, useState } from 'react';
import { accountsOn, api, clearLocalAuth, getLocalToken, getLocalUser, supabase } from './auth';

export type Account = {
  email: string | null;
  name?: string;
  freeMinutes: number;
  freeLeft: number;
  paidLeft: number;
  paidUntil: string | null;
  watermark: boolean;
  paymentsReady: boolean;
  usage: { label: string; seconds: number; refunded: boolean; at: string }[];
  orders: { plan: string; amountPaise: number; seconds: number; at: string }[];
};

export async function fetchAccount(): Promise<Account | null> {
  const res = await api('/api/account');
  if (res.status === 401) {
    clearLocalAuth();
    if (supabase) await supabase.auth.signOut({ scope: 'local' });
    return null;
  }
  return res.ok ? ((await res.json()) as Account) : null;
}

const NO_WATERMARK_EMAILS = [
  'sudhanshugour89@gmail.com',
  'himanshgour7@gmail.com',
];

/** The mark goes on unless the account proves it shouldn't, so a failed check can't remove it. */
export async function currentWatermark() {
  const localUser = getLocalUser();
  if (localUser?.email && NO_WATERMARK_EMAILS.includes(localUser.email.toLowerCase())) {
    return false;
  }

  const account = await fetchAccount();
  if (account?.email && NO_WATERMARK_EMAILS.includes(account.email.toLowerCase())) {
    return false;
  }
  return account?.watermark ?? true;
}

export const minutesLeft = (account: Account) => Math.floor((account.freeLeft + account.paidLeft) / 60);

/** Who is signed in, and their minutes. */
export function useAccount() {
  const [state, setState] = useState<{ ready: boolean; signedIn: boolean; account: Account | null }>({
    ready: false,
    signedIn: false,
    account: null,
  });

  const refresh = useCallback(async () => {
    // 1. Check Supabase session
    if (supabase) {
      const { session } = (await supabase.auth.getSession()).data;
      if (session) {
        const account = await fetchAccount();
        setState({ ready: true, signedIn: true, account });
        return;
      }
    }

    // 2. Check local JWT session
    const localToken = getLocalToken();
    if (localToken) {
      const account = await fetchAccount();
      if (account) {
        setState({ ready: true, signedIn: true, account });
        return;
      }
    }

    // 3. Not signed in
    setState({ ready: true, signedIn: false, account: null });
  }, []);

  useEffect(() => {
    refresh();

    // Listen to local auth events
    const onAuthChange = () => refresh();
    window.addEventListener('cwaya-auth-change', onAuthChange);

    // Listen to Supabase auth events if active
    let unsubscribe = () => {};
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange(() => void setTimeout(refresh));
      unsubscribe = () => data.subscription.unsubscribe();
    }

    return () => {
      window.removeEventListener('cwaya-auth-change', onAuthChange);
      unsubscribe();
    };
  }, [refresh]);

  return { ...state, refresh };
}
