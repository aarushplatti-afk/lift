import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wipeLocalData } from '../../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../../db/repos/settings';
import { db } from '../../../db/schema';
import { useToastStore } from '../../../components/ui/toastStore';
import { useSettingsStore } from '../../../store/settings';
import { OnboardingGate } from '../OnboardingGate';

const complete = vi.hoisted(() => vi.fn());
const skip = vi.hoisted(() => vi.fn());
const install = vi.hoisted(() => ({
  value: { platform: 'other', canPrompt: false, promptInstall: vi.fn() } as {
    platform: string;
    canPrompt: boolean;
    promptInstall: () => Promise<string>;
  },
}));

vi.mock('../../../db/repos/onboarding', async (orig) => {
  const actual = await orig<typeof import('../../../db/repos/onboarding')>();
  return { ...actual, completeOnboarding: complete, skipOnboarding: skip };
});
vi.mock('../../../hooks/useInstallPrompt', () => ({ useInstallPrompt: () => install.value }));

beforeEach(async () => {
  await wipeLocalData();
  complete.mockReset().mockResolvedValue({ bodyweightSaved: true, templatesAdded: 3 });
  skip.mockReset().mockResolvedValue(undefined);
  install.value = { platform: 'other', canPrompt: false, promptInstall: vi.fn() };
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, unit: 'lb' }, hydrated: true });
});

describe('OnboardingGate', () => {
  it('shows the welcome sheet for an empty, un-onboarded account', async () => {
    render(<OnboardingGate />);
    expect(await screen.findByRole('dialog', { name: 'Welcome to Lift' })).toBeInTheDocument();
  });

  it('stays hidden when onboarded, not hydrated, or data exists', async () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardedAt: 5 } });
    const first = render(<OnboardingGate />);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    first.unmount();

    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, hydrated: false });
    const second = render(<OnboardingGate />);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    second.unmount();

    useSettingsStore.setState({ hydrated: true });
    await db.bodyweight.put({
      id: 'b1',
      userId: 'u',
      date: '2026-01-01',
      weightKg: 80,
      createdAt: 1,
      updatedAt: 1,
    });
    render(<OnboardingGate />);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when onboardedAt is set externally', async () => {
    render(<OnboardingGate />);
    await screen.findByRole('dialog');
    act(() => {
      useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardedAt: 7 } });
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('shows a toast when starter templates could not be added', async () => {
    complete.mockResolvedValue({ bodyweightSaved: false, templatesAdded: 0 });
    render(<OnboardingGate />);
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Get started' }));
    await waitFor(() => {
      expect(useToastStore.getState().toast?.message).toMatch(/starter templates/);
    });
  });

  it('Get started saves unit, weight and templates', async () => {
    render(<OnboardingGate />);
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('radio', { name: 'kg' }));
    await userEvent.type(screen.getByLabelText(/Current bodyweight in kg/), '80,5');
    await userEvent.click(screen.getByRole('button', { name: 'Get started' }));
    await waitFor(() => {
      expect(complete).toHaveBeenCalledTimes(1);
    });
    expect(complete.mock.calls[0]?.[0]).toEqual({
      unit: 'kg',
      bodyweightKg: 80.5,
      addStarterTemplates: true,
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('Skip writes the flag only', async () => {
    render(<OnboardingGate />);
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => {
      expect(skip).toHaveBeenCalledTimes(1);
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it('Escape acts as Skip', async () => {
    render(<OnboardingGate />);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(skip).toHaveBeenCalledTimes(1);
    });
  });

  it('blocks Get started on an invalid weight', async () => {
    render(<OnboardingGate />);
    await screen.findByRole('dialog');
    await userEvent.type(screen.getByLabelText(/Current bodyweight/), '0');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get started' })).toBeDisabled();
  });

  it('keeps the sheet open when saving fails', async () => {
    complete.mockRejectedValue(new Error('x'));
    render(<OnboardingGate />);
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Get started' }));
    await waitFor(() => {
      expect(complete).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Get started' })).toBeEnabled();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows install guidance by platform', async () => {
    install.value = { platform: 'standalone', canPrompt: false, promptInstall: vi.fn() };
    const first = render(<OnboardingGate />);
    await screen.findByRole('dialog');
    expect(screen.queryByText('Add to Home Screen')).not.toBeInTheDocument();
    first.unmount();

    install.value = { platform: 'ios', canPrompt: false, promptInstall: vi.fn() };
    const second = render(<OnboardingGate />);
    await screen.findByRole('dialog');
    expect(screen.getByText(/Tap the Share button/)).toBeInTheDocument();
    second.unmount();

    const promptInstall = vi.fn().mockResolvedValue('accepted');
    install.value = { platform: 'android', canPrompt: true, promptInstall };
    render(<OnboardingGate />);
    await userEvent.click(await screen.findByRole('button', { name: 'Install app' }));
    expect(promptInstall).toHaveBeenCalled();
  });
});
