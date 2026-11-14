import { create } from 'zustand';
import { observeInitialPullDone } from '../db/repos/meta';
import { getCachedSession, onAuthChange, type AuthIdentity } from '../sync/auth';

interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn';
  identity?: AuthIdentity;
  initialPullDone: boolean;
  init: () => () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  identity: undefined,
  initialPullDone: false,
  init: () => {
    let active = true;
    const apply = (identity: AuthIdentity | null): void => {
      if (!active) return;
      set(
        identity ? { status: 'signedIn', identity } : { status: 'signedOut', identity: undefined },
      );
    };
    const stopAuth = onAuthChange(apply);
    const sub = observeInitialPullDone().subscribe({
      next: (initialPullDone) => set({ initialPullDone }),
      error: () => undefined,
    });
    getCachedSession().then(apply, () => apply(null));
    return () => {
      active = false;
      stopAuth();
      sub.unsubscribe();
    };
  },
}));
