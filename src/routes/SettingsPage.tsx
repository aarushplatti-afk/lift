import { useNavigate } from 'react-router-dom';
import { Header } from '../components/ui/Header';
import { IconButton } from '../components/ui/IconButton';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Stepper } from '../components/ui/Stepper';
import { Toggle } from '../components/ui/Toggle';
import { useToastStore } from '../components/ui/toastStore';
import { AboutSection } from './Settings/AboutSection';
import { AccountSyncSection } from './Settings/AccountSyncSection';
import { DataSection } from './Settings/DataSection';
import { GoalWeightField } from './Settings/GoalWeightField';
import { Section } from './Settings/Section';
import { REST_MAX_SEC, REST_MIN_SEC, REST_STEP_SEC } from '../lib/calc/rest';
import { formatDurationInput } from '../lib/duration';
import { formatWeight } from '../lib/format';
import { isVibrationSupported } from '../lib/platform/haptics';
import { isWakeLockSupported } from '../lib/platform/wakeLock';
import { useSettingsStore } from '../store/settings';
import type { ThemePref, Unit } from '../types/domain';

const UNIT_OPTIONS: readonly { value: Unit; label: string }[] = [
  { value: 'lb', label: 'lb' },
  { value: 'kg', label: 'kg' },
];

const THEME_OPTIONS: readonly { value: ThemePref; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const saveSetting = (patch: Parameters<typeof update>[0]) => {
    update(patch).catch(() => {
      useToastStore.getState().show({ message: "Couldn't save setting" });
    });
  };

  return (
    <>
      <Header
        title="Settings"
        left={
          <IconButton
            aria-label="Back"
            onClick={() => {
              navigate(-1);
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </IconButton>
        }
      />
      <div className="pl-safe pr-safe pb-safe flex flex-col gap-6 p-4">
        <Section title="Units">
          <SegmentedControl
            label="Weight unit"
            options={UNIT_OPTIONS}
            value={settings.unit}
            onChange={(unit) => {
              saveSetting({ unit });
            }}
          />
          <p className="text-body-sm text-secondary tabular-nums">
            Example: 100 kg = {formatWeight(100, settings.unit, { withUnit: true })}
          </p>
        </Section>

        <Section title="Appearance">
          <SegmentedControl
            label="Theme"
            options={THEME_OPTIONS}
            value={settings.theme}
            onChange={(theme) => {
              saveSetting({ theme });
            }}
          />
        </Section>

        <Section title="Workout">
          <Stepper
            label="Default rest time"
            value={settings.defaultRestSeconds}
            min={REST_MIN_SEC}
            max={REST_MAX_SEC}
            step={REST_STEP_SEC}
            format={formatDurationInput}
            onChange={(defaultRestSeconds) => {
              saveSetting({ defaultRestSeconds });
            }}
          />
          <Toggle
            label="Auto-start rest timer"
            checked={settings.restTimerAutoStart}
            onChange={(restTimerAutoStart) => {
              saveSetting({ restTimerAutoStart });
            }}
          />
          <Toggle
            label="Sound"
            description="Chime when rest ends. Muted by the silent switch on iPhone."
            checked={settings.soundEnabled}
            onChange={(soundEnabled) => {
              saveSetting({ soundEnabled });
            }}
          />
          {isVibrationSupported() && (
            <Toggle
              label="Haptics"
              checked={settings.hapticsEnabled}
              onChange={(hapticsEnabled) => {
                saveSetting({ hapticsEnabled });
              }}
            />
          )}
          <Toggle
            label="Keep screen awake"
            description={
              isWakeLockSupported()
                ? 'While the workout screen is open.'
                : 'Not supported in this browser.'
            }
            disabled={!isWakeLockSupported()}
            checked={settings.keepScreenAwakeDuringWorkout}
            onChange={(keepScreenAwakeDuringWorkout) => {
              saveSetting({ keepScreenAwakeDuringWorkout });
            }}
          />
        </Section>

        <Section title="Bodyweight">
          <GoalWeightField
            goalKg={settings.bodyweightGoalKg}
            unit={settings.unit}
            onSave={(bodyweightGoalKg) => {
              saveSetting({ bodyweightGoalKg });
            }}
          />
        </Section>

        <AccountSyncSection />

        <DataSection />

        <AboutSection />
      </div>
    </>
  );
}
