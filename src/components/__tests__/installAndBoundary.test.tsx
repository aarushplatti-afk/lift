import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from '../../lib/version';
import { AboutSection } from '../../routes/Settings/AboutSection';
import { AppErrorBoundary } from '../AppErrorBoundary';

const install = vi.hoisted(() => ({
  value: { platform: 'other', canPrompt: false, promptInstall: vi.fn() } as {
    platform: string;
    canPrompt: boolean;
    promptInstall: () => Promise<string>;
  },
}));
const exportBackup = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useInstallPrompt', () => ({ useInstallPrompt: () => install.value }));
vi.mock('../../hooks/useBackupExport', () => ({
  useBackupExport: () => ({ exporting: false, exportBackup }),
}));

beforeEach(() => {
  install.value = { platform: 'other', canPrompt: false, promptInstall: vi.fn() };
  exportBackup.mockReset();
});

describe('AboutSection', () => {
  it('shows the version and hides Install app without a captured prompt', () => {
    render(
      <MemoryRouter>
        <AboutSection />
      </MemoryRouter>,
    );
    expect(screen.getByText(APP_VERSION)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
  });

  it('offers Install app when a prompt is available and opens the help sheet', async () => {
    const promptInstall = vi.fn().mockResolvedValue('accepted');
    install.value = { platform: 'android', canPrompt: true, promptInstall };
    render(
      <MemoryRouter>
        <AboutSection />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Install app' }));
    expect(promptInstall).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /How to install/ }));
    expect(await screen.findByRole('dialog', { name: 'How to install' })).toBeInTheDocument();
  });
});

function Boom(): never {
  throw new Error('kaboom');
}

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('renders the fallback, copies details and exports a backup', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copy details' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('kaboom'));
    await userEvent.click(screen.getByRole('button', { name: 'Export backup' }));
    expect(exportBackup).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('falls back to selectable text when the clipboard fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('no'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Copy details' }));
    const box = await screen.findByLabelText('Error details');
    expect((box as HTMLTextAreaElement).value).toContain('kaboom');
  });
});
