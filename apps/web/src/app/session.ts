import type { LoginResponse, User } from '@drlaudo/contract';
import { createElement, Fragment, useCallback, useEffect, useRef, type ReactNode } from 'react';

import { useNavigate } from 'react-router';
import { api } from './api';
import { beginRestoration, resetSession, sessionRestored, setSession, setStatus, type AuthState } from './authSlice';
import { useAppDispatch, useAppSelector, useAppStore } from './hooks';
import { homeForRole } from './navigation';
import { parseStoredSession, SESSION_EXPIRED_NOTICE, SESSION_STORAGE_KEY, sessionExpiresAt } from './sessionStorage';


export interface SessionAccess {
  user: User | null;
  status: AuthState['status'];
  notice: string | null;
  login: (response: LoginResponse) => void;
  logout: () => void;
  retry: () => void;
}
export function useSession(): SessionAccess {
  const auth = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const login = useCallback((response: LoginResponse) => {
    const parsed = parseStoredSession(JSON.stringify(response));
    if (!parsed) throw new Error('Não foi possível iniciar a sessão.');
    dispatch(setSession(parsed));
  }, [dispatch]);
  const logout = useCallback(() => {
    dispatch(resetSession());
    void navigate('/login', { replace: true, state: null });
  }, [dispatch, navigate]);
  const retry = useCallback(() => {
    if (!auth.session) return;
    const expiresAt = sessionExpiresAt(auth.session);
    if (expiresAt === null || Date.now() >= expiresAt) dispatch(resetSession({ notice: SESSION_EXPIRED_NOTICE }));
    else dispatch(beginRestoration(auth.session));
  }, [auth.session, dispatch]);
  return { user: auth.status === 'authenticated' ? auth.session?.user ?? null : null, status: auth.status, notice: auth.notice, login, logout, retry };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const auth = useAppSelector((state) => state.auth);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (store.getState().auth.status !== 'restoring' || store.getState().auth.session) return;
    let raw: string | null = null;
    try { raw = localStorage.getItem(SESSION_STORAGE_KEY); } catch { /* No storage means no restorable identity. */ }
    const session = raw === null ? null : parseStoredSession(raw);
    if (session) dispatch(beginRestoration(session));
    else dispatch(resetSession(raw === null ? undefined : { notice: SESSION_EXPIRED_NOTICE }));
  }, [dispatch, store]);

  useEffect(() => {
    if (auth.status !== 'restoring' || !auth.session) return;
    const generation = auth.generation;
    const candidate = auth.session;
    const request = dispatch(api.endpoints.getMe.initiate(undefined, { subscribe: false, forceRefetch: true }));
    void request.unwrap().then((user) => {
      if (store.getState().auth.generation !== generation) return;
      if (user.id !== candidate.user.id || user.role !== candidate.user.role) {
        dispatch(resetSession({ notice: SESSION_EXPIRED_NOTICE }));
        return;
      }
      dispatch(sessionRestored(user));
    }).catch(() => {
      if (store.getState().auth.generation === generation) dispatch(setStatus('error'));
    });
    return () => { request.abort(); };
  }, [auth.generation, auth.session, auth.status, dispatch, store]);

  useEffect(() => {
    if (!auth.session) return;
    const expiresAt = sessionExpiresAt(auth.session);
    let timer: number | undefined;
    const expireIfNeeded = () => {
      window.clearTimeout(timer);
      const remaining = expiresAt === null ? 0 : expiresAt - Date.now();
      if (remaining <= 0) dispatch(resetSession({ notice: SESSION_EXPIRED_NOTICE }));
      else timer = window.setTimeout(expireIfNeeded, remaining);
    };
    expireIfNeeded();
    window.addEventListener('focus', expireIfNeeded);
    document.addEventListener('visibilitychange', expireIfNeeded);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', expireIfNeeded);
      document.removeEventListener('visibilitychange', expireIfNeeded);
    };
  }, [auth.session, dispatch]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SESSION_STORAGE_KEY && event.key !== null) return;
      if (event.storageArea && event.storageArea !== localStorage) return;
      const session = event.newValue === null ? null : parseStoredSession(event.newValue);
      if (session) {
        dispatch(beginRestoration(session));
        void navigate('/', { replace: true, state: null });
      } else {
        dispatch(resetSession(event.newValue === null ? undefined : { notice: SESSION_EXPIRED_NOTICE }));
        void navigate('/login', { replace: true, state: null });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [dispatch, navigate]);

  useEffect(() => {
    if (auth.status === 'anonymous' && auth.notice === SESSION_EXPIRED_NOTICE) void navigate('/login', { replace: true, state: null });
    if (auth.status === 'authenticated' && auth.notice === 'Você não tem permissão para esta ação.' && auth.session) {
      void navigate(homeForRole(auth.session.user.role), { replace: true, state: null });
    }
  }, [auth.notice, auth.session, auth.status, navigate]);

  // A generation boundary unmounts local filters, selection and unsaved forms.
  // Server data is independently aborted/reset by sessionIsolation middleware.
  return createElement(Fragment, { key: auth.generation }, children);
}
