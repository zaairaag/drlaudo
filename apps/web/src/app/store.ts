import { configureStore, type EnhancedStore, type StateFromReducersMapObject, type ThunkDispatch, type UnknownAction } from '@reduxjs/toolkit';
import { api } from './api';
import { authSlice } from './authSlice';
import { sessionIsolation } from './sessionIsolation';

const reducers = { auth: authSlice.reducer, api: api.reducer };
export type RootState = StateFromReducersMapObject<typeof reducers>;
export type AppDispatch = ThunkDispatch<RootState, undefined, UnknownAction>;
export type AppStore = EnhancedStore<RootState> & { dispatch: AppDispatch };

export function createAppStore(): AppStore {
  return configureStore({
    reducer: reducers,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sessionIsolation, api.middleware),
  });
}
export const store = createAppStore();
