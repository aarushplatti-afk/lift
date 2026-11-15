import { useEffect } from 'react';
import { HashRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthGate, ConfigError } from './components/AuthGate';
import { UpdateToast } from './components/UpdateToast';
import { TabBar } from './components/ui/TabBar';
import { ToastHost } from './components/ui/Toast';
import { WorkoutMiniBar } from './components/workout/WorkoutMiniBar';
import { ExerciseDetail } from './routes/ExercisesTab/ExerciseDetail';
import { ExerciseFormPage } from './routes/ExercisesTab/ExerciseFormPage';
import { ExerciseList } from './routes/ExercisesTab/ExerciseList';
import { HistoryList } from './routes/HistoryTab/HistoryList';
import { WorkoutDetail } from './routes/HistoryTab/WorkoutDetail';
import { WorkoutEditor } from './routes/HistoryTab/WorkoutEditor';
import { ProgressTab } from './routes/ProgressTab';
import { SettingsPage } from './routes/SettingsPage';
import { ActiveWorkout } from './routes/WorkoutTab/ActiveWorkout';
import { Summary } from './routes/WorkoutTab/Summary';
import { TemplateEditor } from './routes/WorkoutTab/Templates/TemplateEditor';
import { WorkoutHome } from './routes/WorkoutTab/WorkoutHome';
import { isSupabaseConfigured, getSupabase } from './lib/supabase';
import { applyTheme } from './lib/theme';
import { useAuthStore } from './store/auth';
import { initActiveWorkoutStore, useActiveWorkoutStore } from './store/activeWorkout';
import { initRestTimer } from './store/restTimer';
import { initSettingsStore, useSettingsStore } from './store/settings';
import { initSyncStore } from './store/sync';
import { getSyncEngine } from './sync/engine';
import { startSyncTriggers } from './sync/triggers';

function Layout() {
  const { pathname } = useLocation();
  const workoutActive = useActiveWorkoutStore((s) => s.workout !== null);
  const inWorkoutFlow = pathname.startsWith('/workout/');
  const showTabs =
    !inWorkoutFlow &&
    !pathname.startsWith('/templates/') &&
    pathname !== '/settings' &&
    pathname !== '/exercises/new' &&
    !/^\/exercises\/[^/]+\/edit$/.test(pathname) &&
    !/^\/history\/[^/]+\/edit$/.test(pathname);
  const showMiniBar = showTabs && workoutActive && pathname !== '/';
  const padding = !showTabs
    ? 'pb-safe'
    : showMiniBar
      ? 'pb-[calc(112px+env(safe-area-inset-bottom))]'
      : 'pb-[calc(64px+env(safe-area-inset-bottom))]';
  return (
    <div className={`pl-safe pr-safe min-h-dvh ${padding}`}>
      <Outlet />
      {showMiniBar ? <WorkoutMiniBar /> : null}
      {showTabs ? <TabBar /> : null}
    </div>
  );
}

function Shell() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<WorkoutHome />} />
          <Route path="workout/active" element={<ActiveWorkout />} />
          <Route path="workout/summary/:id" element={<Summary />} />
          <Route path="templates/new" element={<TemplateEditor />} />
          <Route path="templates/:id/edit" element={<TemplateEditor />} />
          <Route path="history" element={<HistoryList />} />
          <Route path="history/:id" element={<WorkoutDetail />} />
          <Route path="history/:id/edit" element={<WorkoutEditor />} />
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
  useEffect(() => (status === 'signedIn' ? initActiveWorkoutStore() : undefined), [status]);
  useEffect(() => (status === 'signedIn' ? initRestTimer() : undefined), [status]);
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
