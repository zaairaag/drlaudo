import { setupWorker } from 'msw/browser';
import React, { type ReactNode } from 'react';
import { MockControls } from './controls.js';
import { createMockDb, type MockDb } from './db.js';
import { createHandlers } from './handlers.js';

let activeDb: MockDb | null = null;

export async function startMocking(): Promise<ReactNode | undefined> {
  if (typeof window === 'undefined') return undefined;

  const clock = { now: () => new Date() };
  const storage = window.sessionStorage;
  const db = createMockDb({ clock, storage });
  activeDb = db;

  const handlers = createHandlers({ db, clock });
  const worker = setupWorker(...handlers);

  await worker.start({
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
    onUnhandledFrame: 'warn',
    quiet: true,
  });

  return React.createElement(MockControls, { db });
}

export function getActiveMockDb(): MockDb | null {
  return activeDb;
}
