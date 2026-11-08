type RuntimeState = Readonly<{ error500: boolean; slow: boolean }>;

let state: RuntimeState = { error500: false, slow: false };
const listeners = new Set<() => void>();

// Runtime-only switches: they are never persisted with the fictitious clinical snapshot.
export const mockRuntime = {
  getSnapshot: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  set(patch: Partial<RuntimeState>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  },
  reset() {
    state = { error500: false, slow: false };
    for (const listener of listeners) listener();
  },
};
