import { useEffect } from 'react';
import { HashRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthGate, ConfigError } from './components/AuthGate';
import { UpdateToast } from './components/UpdateToast';
import { TabBar } from './components/ui/TabBar';
import { ToastHost } from './components/ui/Toast';
import { ExerciseDetail } from './routes/ExercisesTab/ExerciseDetail';
import { ExerciseFormPage } from './routes/ExercisesTab/ExerciseFormPage';
import { ExerciseList } from './routes/ExercisesTab/ExerciseList';
import { HistoryTab } from './routes/HistoryTab';
import { ProgressTab } from './routes/ProgressTab';
import { SettingsPage } from './routes/SettingsPage';
import { WorkoutTab } from './routes/WorkoutTab';
import { isSupabaseConfigured, getSupabase } from './lib/supabase';
import { applyTheme } from './lib/theme';
import { useAuthStore } from './store/auth';
import { initSettingsStore, useSettingsStore } from './store/settings';
import { initSyncStore } from './store/sync';
import { getSyncEngine } from './sync/engine';
import { startSyncTriggers } from './sync/triggers';

function Layout() {
  const { pathname } = useLocation();
  const showTabs =
    pathname !== '/settings' &&
    pathname !== '/exercises/new' &&
    !/^\/exercises\/[^/]+\/edit$/.test(pathname);
  return (
    <div
      className={`pl-safe pr-safe min-h-dvh ${showTabs ? 'pb-[calc(64px+env(safe-area-inset-bottom))]' : 'pb-safe'}`}
    >
      <Outlet />
      {showTabs ? <TabBar /> : null}
    </div>
  );
}

function Shell() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<WorkoutTab />} />
          <Route path="history" element={<HistoryTab />} />
          <Route path="progress" element={<ProgressTab />} />
          <Route path="exercises" element={<ExerciseList />} />
          <Route path="exercises/new" element={<ExerciseFormPage />} />
          <Route path="exercises/:id" element={<ExerciseDetail />} />
          <Route path="exercises/:id/edit" element={<ExerciseFormPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

function ConfiguredApp() {
  const status = useAuthStore((s) => s.status);
  const theme = useSettingsStore((s) => s.settings.theme);
  const hydrated = useSettingsStore((s) => s.hydrated);

  useEffect(() => useAuthStore.getState().init(), []);
  useEffect(() => initSettingsStore(), []);
  useEffect(() => initSyncStore(), []);
  useEffect(() => (hydrated ? applyTheme(theme) : undefined), [hydrated, theme]);
  useEffect(() => {
    if (status !== 'signedIn') return undefined;
    return startSyncTriggers(getSyncEngine(), getSupabase().auth);
  }, [status]);

  return (
    <AuthGate>
      <Shell />
    </AuthGate>
  );
}

export default function App() {
  return (
    <>
      {isSupabaseConfigured() ? <ConfiguredApp /> : <ConfigError />}
      <ToastHost />
      <UpdateToast />
    </>
  );
}
