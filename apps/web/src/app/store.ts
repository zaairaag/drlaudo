import { configureStore, type EnhancedStore, type StateFromReducersMapObject, type ThunkDispatch, type UnknownAction } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { api } from './api';
import { authSlice } from './authSlice';
import { sessionIsolation } from './sessionIsolation';

const reducers = { auth: authSlice.reducer, api: api.reducer };
export type RootState = StateFromReducersMapObject<typeof reducers>;
export type AppDispatch = ThunkDispatch<RootState, undefined, UnknownAction>;
export type AppStore = EnhancedStore<RootState> & { dispatch: AppDispatch; dispose: () => void };

export function createAppStore(): AppStore {
  const appStore = configureStore({
    reducer: reducers,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sessionIsolation, api.middleware),
  });
  const stopListeners = setupListeners(appStore.dispatch);
  return Object.assign(appStore, {
    dispose() {
      stopListeners();
      for (const request of appStore.dispatch(api.util.getRunningQueriesThunk())) request.abort();
      for (const request of appStore.dispatch(api.util.getRunningMutationsThunk())) request.abort();
      appStore.dispatch(api.util.resetApiState());
    },
  });
}
export const store = createAppStore();
if (import.meta.hot) import.meta.hot.dispose(() => store.dispose());
