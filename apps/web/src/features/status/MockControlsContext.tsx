import { createContext, useContext, type ReactNode } from 'react';

const MockControlsContext = createContext<ReactNode | null>(null);

export function MockControlsProvider({ controls, children }: { controls: ReactNode | null; children: ReactNode }) {
  return <MockControlsContext.Provider value={controls}>{children}</MockControlsContext.Provider>;
}

export function useMockControls(): ReactNode | null {
  return useContext(MockControlsContext);
}
