import type { Middleware } from '@reduxjs/toolkit';
import { api } from './api';
import { beginRestoration, resetSession, sessionRestored, setSession, type AuthState } from './authSlice';
import { SESSION_STORAGE_KEY } from './sessionStorage';

export const sessionIsolation: Middleware<Record<string, never>, { auth: AuthState }> = (store) => (next) => (action) => {
  const replacesIdentity = setSession.match(action) || resetSession.match(action) || beginRestoration.match(action);
  const result: unknown = next(action);
  if (replacesIdentity) {
    const dispatchThunk = store.dispatch as (thunk: unknown) => { abort?: () => void }[];
    const runningQueries = dispatchThunk(api.util.getRunningQueriesThunk()) || [];
    for (const op of runningQueries) {
      if (typeof op.abort === 'function') op.abort();
    }
    const runningMutations = dispatchThunk(api.util.getRunningMutationsThunk()) || [];
    for (const op of runningMutations) {
      if (typeof op.abort === 'function') op.abort();
    }
    store.dispatch(api.util.resetApiState());
  }
  if (replacesIdentity || sessionRestored.match(action)) {
    try {
      const session = store.getState().auth.session;
      if (session) localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Browser storage may be unavailable. The session remains memory-only;
      // a reload must authenticate again rather than restoring a private cache.
    }
  }
  return result;
};
