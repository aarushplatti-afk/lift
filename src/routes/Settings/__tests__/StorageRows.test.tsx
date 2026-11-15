import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageRows } from '../StorageRows';

const getStorageInfo = vi.hoisted(() => vi.fn());
const requestPersistentStorage = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/platform/storage', () => ({
  getStorageInfo,
  requestPersistentStorage,
  formatBytes: (n: number) => (n > 1e9 ? '1.2 GB' : '2.3 MB'),
}));

beforeEach(() => {
  getStorageInfo.mockReset();
  requestPersistentStorage.mockReset();
});

describe('StorageRows', () => {
  it('shows usage and the persistence status with a button', async () => {
    getStorageInfo.mockResolvedValue({
      usageBytes: 2_300_000,
      quotaBytes: 1_200_000_000_0,
      persisted: false,
      canPersist: true,
    });
    getStorageInfo.mockResolvedValueOnce({
      usageBytes: 2_300_000,
      quotaBytes: 1_200_000_000_0,
      persisted: false,
      canPersist: true,
    });
    render(<StorageRows />);
    expect(await screen.findByText('Using 2.3 MB of 1.2 GB')).toBeInTheDocument();
    expect(screen.getByText('Not enabled')).toBeInTheDocument();
    getStorageInfo.mockResolvedValue({
      usageBytes: 1,
      quotaBytes: 2,
      persisted: true,
      canPersist: true,
    });
    requestPersistentStorage.mockResolvedValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Keep data on this device' }));
    expect(await screen.findByText('On')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep data on this device' })).toBeNull();
  });

  it('renders nothing extra when unsupported', async () => {
    getStorageInfo.mockResolvedValue({ canPersist: false });
    const { container } = render(<StorageRows />);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
