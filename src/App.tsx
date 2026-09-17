import { Suspense, lazy, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { Backdrop } from '@/components/layout/Backdrop';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { AuthDialogProvider } from '@/components/auth/AuthDialog';
import { LoadingBlock } from '@/components/common/atoms';
import { useSettings } from '@/lib/settings';
import { track } from '@/lib/telemetry';
import Home from '@/pages/Home';
import NotFound from '@/pages/NotFound';

/**
 * Only the landing page and the 404 are needed to paint the first screen.
 * Everything else — including the canvas engine behind /play — is fetched on
 * demand, which keeps the initial payload small on mobile connections.
 */
const Play = lazy(() => import('@/pages/Play'));
const Leaderboards = lazy(() => import('@/pages/Leaderboards'));
const Daily = lazy(() => import('@/pages/Daily'));
const Achievements = lazy(() => import('@/pages/Achievements'));
const Profile = lazy(() => import('@/pages/Profile'));
const PilotProfile = lazy(() => import('@/pages/PilotProfile'));
const RunDetail = lazy(() => import('@/pages/RunDetail'));
const Settings = lazy(() => import('@/pages/Settings'));
const About = lazy(() => import('@/pages/About'));
const Admin = lazy(() => import('@/pages/Admin'));

function RouteFallback() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <LoadingBlock label="Loading module" rows={4} />
    </div>
  );
}

export default function App() {
  const settings = useSettings();
  const location = useLocation();
  const reduced = useReducedMotion();

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(settings.reducedMotion);
  }, [settings.reducedMotion]);

  useEffect(() => {
    track('page_view', { path: location.pathname });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <AuthDialogProvider>
      <div className="relative flex min-h-screen flex-col">
        <Backdrop />

      <a
        href="#main"
        className="sr-only-focusable fixed left-4 top-4 z-50 rounded-full border border-primary/40 bg-background px-4 py-2 text-sm font-medium text-primary"
      >
        Skip to content
      </a>

      <SiteHeader />

      <main id="main" className="relative flex-1">
        <ErrorBoundary>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={reduced ? { opacity: 1 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 1 } : { opacity: 0, y: -8 }}
              transition={{ duration: reduced ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <Suspense fallback={<RouteFallback />}>
                <Routes location={location}>
                  <Route path="/" element={<Home />} />
                  <Route path="/play" element={<Play />} />
                  <Route path="/play/:mode" element={<Play />} />
                  <Route path="/leaderboards" element={<Leaderboards />} />
                  <Route path="/daily" element={<Daily />} />
                  <Route path="/achievements" element={<Achievements />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/pilots/:handle" element={<PilotProfile />} />
                  <Route path="/runs/:id" element={<RunDetail />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </ErrorBoundary>
      </main>

        <SiteFooter />
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: 'glass-strong border-white/10 text-foreground font-sans',
          }}
        />
      </div>
    </AuthDialogProvider>
  );
}
