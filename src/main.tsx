import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from '@/lib/auth';
import { settingsStore } from '@/lib/settings';
import { ApiError } from '@/lib/api';
import { installTelemetryLifecycle } from '@/lib/telemetry';
import './index.css';

/**
 * Query defaults are tuned for a live scoreboard: data is refetched often, but
 * a transient API failure shows the last good value instead of an error wall.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (attempt, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return attempt < 2;
      },
      refetchOnWindowFocus: true,
      staleTime: 15_000,
      gcTime: 5 * 60_000,
    },
    mutations: { retry: 0 },
  },
});

settingsStore.applySystemDefaults();
installTelemetryLifecycle();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root is missing from index.html');

createRoot(rootElement).render(
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
);
