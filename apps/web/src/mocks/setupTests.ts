import { afterAll, afterEach, beforeAll } from 'vitest';
import { resetMockServerState, server } from './node.js';
import { mockRuntime } from './runtime.js';

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  resetMockServerState();
  mockRuntime.reset();

  if (typeof window !== 'undefined') {
    try { window.sessionStorage.clear(); } catch { /* ignore */ }
    try { window.localStorage.clear(); } catch { /* ignore */ }
    document.body.innerHTML = '';
  }
});

afterAll(() => {
  server.close();
});
