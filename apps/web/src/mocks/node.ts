import { setupServer } from 'msw/node';
import { createMockDb, type MockDb } from './db.js';
import { createTestClock, resetTestDb, type TestClock } from './fixtures.js';
import { createHandlers } from './handlers.js';

export const mockClock: TestClock = createTestClock('2026-11-10T12:00:00.000Z');
export const mockDb: MockDb = createMockDb({ clock: mockClock });
resetTestDb(mockDb, '2026-11-10T12:00:00.000Z');

// Default server configured for Node-based test runners (isolated, latency: 0).
export const server = setupServer(...createHandlers({ db: mockDb, clock: mockClock, latency: 0 }));

export function resetMockServerState(nowIso = '2026-11-10T12:00:00.000Z'): void {
  mockClock.set(nowIso);
  resetTestDb(mockDb, nowIso);
  server.resetHandlers(...createHandlers({ db: mockDb, clock: mockClock, latency: 0 }));
}
