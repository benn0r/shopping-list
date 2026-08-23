import { addItem, loadItems, removeItem, restoreItem } from '../../src/services/bringApi';
import { loadBringSyncEnabled, loadCredentials } from '../../src/services/storage';
import { bringSyncAdapter } from '../../src/services/sync/bringSyncAdapter';

jest.mock('../../src/services/bringApi', () => ({
  addItem: jest.fn(),
  loadItems: jest.fn(),
  removeItem: jest.fn(),
  restoreItem: jest.fn(),
}));
jest.mock('../../src/services/storage', () => ({
  loadBringSyncEnabled: jest.fn(),
  loadCredentials: jest.fn(),
}));

const credentials = { email: 'pilot@example.com', password: 'secret' };
const target = {
  provider: 'bring' as const,
  remoteListId: 'remote-list',
  remoteListName: 'Remote List',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(loadBringSyncEnabled).mockResolvedValue(true);
  jest.mocked(loadCredentials).mockResolvedValue(credentials);
});

it('exposes provider status without leaking Bring concerns into the sync service', async () => {
  await expect(bringSyncAdapter.isEnabled()).resolves.toBe(true);
  await expect(bringSyncAdapter.isAuthenticated()).resolves.toBe(true);
  jest.mocked(loadCredentials).mockResolvedValueOnce(null);
  await expect(bringSyncAdapter.isAuthenticated()).resolves.toBe(false);
});

it('maps Bring items to provider-neutral remote items', async () => {
  jest
    .mocked(loadItems)
    .mockResolvedValue([
      { uuid: 'item-1', label: 'Milk', specification: '2×', barcode: '7612345678901' },
    ]);
  await expect(bringSyncAdapter.loadItems(target)).resolves.toEqual([
    { id: 'item-1', label: 'Milk', specification: '2×', barcode: '7612345678901' },
  ]);
  expect(loadItems).toHaveBeenCalledWith(credentials, 'remote-list');
});

it('delegates add and remove operations with provider-specific payloads', async () => {
  await bringSyncAdapter.addItem(target, {
    barcode: '7612345678901',
    label: 'Milk',
    quantity: 2,
    scannedAt: 1,
  });
  expect(addItem).toHaveBeenCalledWith(credentials, 'remote-list', 'Milk', 2, '7612345678901');

  await bringSyncAdapter.restoreItem!(target, {
    barcode: '7612345678901',
    label: 'Milk',
    scannedAt: 1,
    remoteItemId: 'item-1',
    remoteSpecification: '2×',
  });
  expect(restoreItem).toHaveBeenLastCalledWith(credentials, 'remote-list', {
    uuid: 'item-1',
    label: 'Milk',
    specification: '2×',
    barcode: '7612345678901',
  });

  await bringSyncAdapter.removeItem(target, {
    id: 'item-1',
    label: 'Milk',
    specification: '2×',
  });
  expect(removeItem).toHaveBeenCalledWith(credentials, 'remote-list', {
    uuid: 'item-1',
    label: 'Milk',
    specification: '2×',
  });
});

it('returns no items without credentials and rejects mutations', async () => {
  jest.mocked(loadCredentials).mockResolvedValue(null);
  await expect(bringSyncAdapter.loadItems(target)).resolves.toEqual([]);
  await expect(
    bringSyncAdapter.addItem(target, { barcode: '1', label: 'Milk', scannedAt: 1 }),
  ).rejects.toThrow('Sync provider is not configured.');
  await expect(
    bringSyncAdapter.restoreItem!(target, { barcode: '1', label: 'Milk', scannedAt: 1 }),
  ).rejects.toThrow('Sync provider is not configured.');
  await expect(bringSyncAdapter.removeItem(target, { id: '1', label: 'Milk' })).rejects.toThrow(
    'Sync provider is not configured.',
  );
});
