import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router';
import { store } from './app/store';
import { router } from './router';
import './styles/globals.css';

async function bootstrap() {
  let mockControls: ReactNode = null;
  if (import.meta.env.DEV && import.meta.env.VITE_API_MOCKING === 'true') {
    // Dynamic import is mandatory here so bundlers exclude MSW and mock handlers
    // completely from production builds when import.meta.env.DEV is false.
    const { startMocking } = await import('./mocks/browser');
    const controls = await startMocking();
    mockControls = controls ?? null;
  } else if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    // Ao desligar ou trocar modo, desregistra somente o mockServiceWorker próprio
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        if (registration.active?.scriptURL.endsWith('/mockServiceWorker.js')) {
          void registration.unregister();
        }
      }
    } catch {
      // Ignora falhas de acesso a serviceWorker em contextos restritos
    }
  }

  const container = document.getElementById('root');
  if (!container) throw new Error('Elemento raiz #root não encontrado.');
  let application: ReactNode = <RouterProvider router={router} />;
  if (import.meta.env.DEV) {
    // A static import would retain development controls in the production module graph.
    const { MockControlsProvider } = await import('./features/status/MockControlsContext');
    application = <MockControlsProvider controls={mockControls}>{application}</MockControlsProvider>;
  }

  createRoot(container).render(
    <StrictMode>
      <Provider store={store}>
        {application}
      </Provider>
    </StrictMode>,
  );
}

void bootstrap();
