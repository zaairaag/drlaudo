import type { LoginResponse, User } from '@drlaudo/contract';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface AuthState {
  session: LoginResponse | null;
  status: 'anonymous' | 'restoring' | 'authenticated' | 'error';
  notice: string | null;
  generation: number;
}
const initialState: AuthState = { session: null, status: 'restoring', notice: null, generation: 0 };

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSession(state, action: PayloadAction<LoginResponse>) {
      state.session = action.payload;
      state.status = 'authenticated';
      state.notice = null;
      state.generation += 1;
    },
    beginRestoration(state, action: PayloadAction<LoginResponse>) {
      state.session = action.payload;
      state.status = 'restoring';
      state.notice = null;
      state.generation += 1;
    },
    sessionRestored(state, action: PayloadAction<User>) {
      if (!state.session) return;
      state.session.user = action.payload;
      state.status = 'authenticated';
      state.notice = null;
    },
    resetSession(state, action: PayloadAction<{ notice?: string } | undefined>) {
      state.session = null;
      state.status = 'anonymous';
      state.notice = action.payload?.notice ?? null;
      state.generation += 1;
    },
    setStatus(state, action: PayloadAction<AuthState['status']>) {
      state.status = action.payload;
    },
    setNotice(state, action: PayloadAction<string | null>) {
      state.notice = action.payload;
    },
  },
});
export const { setSession, beginRestoration, sessionRestored, resetSession, setStatus, setNotice } = authSlice.actions;
