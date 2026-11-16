import { useId, useState } from 'react';
import { InstallInstructions } from '../../components/InstallInstructions';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { TextInput } from '../../components/ui/TextInput';
import { useToastStore } from '../../components/ui/toastStore';
import { completeOnboarding, skipOnboarding } from '../../db/repos/onboarding';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { roundBodyweightKg, validateBodyweightKg } from '../../lib/calc/bodyweight';
import { fromDisplayInput } from '../../lib/units';
import { useSettingsStore } from '../../store/settings';
import type { Unit } from '../../types/domain';
import { weightErrorMessage } from '../ProgressTab/Bodyweight/weightError';

const UNIT_OPTIONS: readonly { value: Unit; label: string }[] = [
  { value: 'lb', label: 'lb' },
  { value: 'kg', label: 'kg' },
];

const TEMPLATES_FAILED = 'Couldn’t add starter templates. You can add them later from Templates.';
const SAVE_FAILED = 'Couldn’t save. Try again.';

interface WelcomeSheetProps {
  onDone: () => void;
}

interface ParsedWeight {
  kg?: number;
  error?: string;
}

function parseWeight(raw: string, unit: Unit): ParsedWeight {
  if (raw.trim() === '') return {};
  const converted = fromDisplayInput(raw, unit);
  if (converted === undefined) return { error: 'Enter a valid weight' };
  const kg = roundBodyweightKg(converted);
  const error = weightErrorMessage(validateBodyweightKg(kg), unit);
  return error === undefined ? { kg } : { error };
}

export function WelcomeSheet({ onDone }: WelcomeSheetProps) {
  const currentUnit = useSettingsStore((s) => s.settings.unit);
  const { platform } = useInstallPrompt();
  const [unit, setUnit] = useState<Unit>(currentUnit);
  const [weight, setWeight] = useState('');
  const [addTemplates, setAddTemplates] = useState(true);
  const [saving, setSaving] = useState(false);
  const checkboxId = useId();

  const parsed = parseWeight(weight, unit);

  const run = async (action: () => Promise<unknown>) => {
    setSaving(true);
    try {
      const result = await action();
      if (
        typeof result === 'object' &&
        result !== null &&
        'templatesFailed' in result &&
        result.templatesFailed === true
      ) {
        useToastStore.getState().show({ message: TEMPLATES_FAILED });
      }
      onDone();
    } catch {
      useToastStore.getState().show({ message: SAVE_FAILED });
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    if (saving) return;
    void run(() => skipOnboarding(Date.now()));
  };

  const start = () => {
    if (saving || parsed.error !== undefined) return;
    void run(() =>
      completeOnboarding(
        { unit, bodyweightKg: parsed.kg, addStarterTemplates: addTemplates },
        Date.now(),
      ),
    );
  };

  return (
    <BottomSheet
      open
      title="Welcome to Lift"
      onClose={skip}
      footer={
        <div className="flex flex-col gap-2 pb-3">
          <Button
            size="lg"
            fullWidth
            disabled={saving || parsed.error !== undefined}
            aria-busy={saving}
            onClick={start}
          >
            Get started
          </Button>
          <Button variant="ghost" fullWidth disabled={saving} onClick={skip}>
            Skip
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-body-sm text-secondary">
          A few quick choices to get you set up. You can change them later in Settings.
        </p>
        <SegmentedControl
          label="Weight unit"
          options={UNIT_OPTIONS}
          value={unit}
          onChange={setUnit}
        />
        <TextInput
          label={`Current bodyweight in ${unit} (optional)`}
          inputMode="decimal"
          autoComplete="off"
          value={weight}
          error={parsed.error}
          onChange={(e) => {
            setWeight(e.target.value);
          }}
        />
        <div className="flex min-h-tap items-center gap-3">
          <input
            id={checkboxId}
            type="checkbox"
            checked={addTemplates}
            onChange={(e) => {
              setAddTemplates(e.target.checked);
            }}
            className="h-6 w-6 shrink-0 accent-accent"
          />
          <label htmlFor={checkboxId} className="text-body">
            Add Push, Pull and Leg Day templates
          </label>
        </div>
        {platform !== 'standalone' ? (
          <section aria-label="Add to Home Screen" className="flex flex-col gap-2">
            <h3 className="text-body font-semibold">Add to Home Screen</h3>
            <InstallInstructions />
          </section>
        ) : null}
      </div>
    </BottomSheet>
  );
}
