import { HashRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { TabBar } from './components/ui/TabBar';
import { ToastHost } from './components/ui/Toast';
import { ExercisesTab } from './routes/ExercisesTab';
import { HistoryTab } from './routes/HistoryTab';
import { ProgressTab } from './routes/ProgressTab';
import { SettingsPage } from './routes/SettingsPage';
import { WorkoutTab } from './routes/WorkoutTab';

function Layout() {
  const { pathname } = useLocation();
  const showTabs = pathname !== '/settings';
  return (
    <div
      className={`pl-safe pr-safe min-h-dvh ${showTabs ? 'pb-[calc(64px+env(safe-area-inset-bottom))]' : 'pb-safe'}`}
    >
      <Outlet />
      {showTabs ? <TabBar /> : null}
      <ToastHost />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<WorkoutTab />} />
          <Route path="history" element={<HistoryTab />} />
          <Route path="progress" element={<ProgressTab />} />
          <Route path="exercises" element={<ExercisesTab />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
