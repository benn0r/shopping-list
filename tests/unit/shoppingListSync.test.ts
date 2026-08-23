import {
  addToSyncedList,
  getListSyncState,
  reconcileRemoteItems,
  removeFromSyncedList,
  restoreToSyncedList,
  syncShoppingList,
} from '../../src/services/shoppingListSync';
import { lookupProduct } from '../../src/services/productLookup';
import {
  loadCustomBarcodes,
  loadLookupPreferences,
  loadActiveShoppingList,
  loadShoppingList,
  loadShoppingLists,
  saveShoppingList,
} from '../../src/services/storage';
import { getSyncAdapter, getSyncAdapters } from '../../src/services/sync/syncAdapters';
import type { ShoppingListSyncAdapter } from '../../src/services/sync/syncAdapter';

jest.mock('../../src/services/productLookup', () => ({ lookupProduct: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  loadCustomBarcodes: jest.fn(),
  loadLookupPreferences: jest.fn(),
  loadActiveShoppingList: jest.fn(),
  loadShoppingList: jest.fn(),
  loadShoppingLists: jest.fn(),
  saveShoppingList: jest.fn(),
}));
jest.mock('../../src/services/sync/syncAdapters', () => ({
  getSyncAdapter: jest.fn(),
  getSyncAdapters: jest.fn(),
}));

const target = {
  provider: 'bring' as const,
  remoteListId: 'moon-list',
  remoteListName: 'Moon List',
};
const localList = { id: 'groceries', name: 'Groceries', syncTarget: target };
const adapter: jest.Mocked<ShoppingListSyncAdapter> = {
  provider: 'bring',
  isEnabled: jest.fn(),
  isAuthenticated: jest.fn(),
  loadItems: jest.fn(),
  addItem: jest.fn(),
  removeItem: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getSyncAdapter).mockReturnValue(adapter);
  jest.mocked(getSyncAdapters).mockReturnValue([adapter]);
  adapter.isEnabled.mockResolvedValue(true);
  adapter.isAuthenticated.mockResolvedValue(true);
  adapter.loadItems.mockResolvedValue([]);
  adapter.addItem.mockResolvedValue(undefined);
  adapter.removeItem.mockResolvedValue(undefined);
  jest.mocked(loadActiveShoppingList).mockResolvedValue(localList);
  jest.mocked(loadShoppingLists).mockResolvedValue([localList]);
  jest.mocked(loadShoppingList).mockResolvedValue([]);
  jest.mocked(loadCustomBarcodes).mockResolvedValue([]);
  jest.mocked(loadLookupPreferences).mockResolvedValue({ language: 'auto', labelStyle: 'generic' });
});

it('reconciles provider-neutral remote IDs while preserving scanned metadata', () => {
  const result = reconcileRemoteItems(
    [
      {
        barcode: '7611111111111',
        label: 'Moon Milk',
        imageUrl: 'https://images.example/milk.png',
        scannedAt: 1,
      },
      { barcode: 'old', label: 'Old Bread', scannedAt: 2, remoteItemId: 'removed-id' },
    ],
    [
      { id: 'milk-id', label: 'moon milk', specification: '2×', quantity: 2, unit: 'cartons' },
      { id: 'bread-id', label: 'Star Bread', barcode: '7612222222222' },
    ],
    99,
  );
  expect(result).toEqual([
    expect.objectContaining({
      remoteItemId: 'milk-id',
      imageUrl: expect.any(String),
      quantity: 2,
      unit: 'cartons',
    }),
    expect.objectContaining({
      remoteItemId: 'bread-id',
      barcode: '7612222222222',
      scannedAt: 99,
    }),
  ]);
});

it('updates linked items and keeps unmatched local items pending', () => {
  expect(
    reconcileRemoteItems(
      [
        { barcode: '123', label: 'Old name', scannedAt: 1, remoteItemId: 'remote-1' },
        { barcode: '456', label: 'Local only', scannedAt: 2 },
      ],
      [{ id: 'remote-1', label: 'New name' }],
    ),
  ).toEqual([
    expect.objectContaining({ label: 'New name', remoteItemId: 'remote-1' }),
    expect.objectContaining({ label: 'Local only' }),
  ]);
});

it('pushes pending items through the selected adapter and persists the result', async () => {
  const local = { barcode: '123', label: 'Moon Milk', quantity: 2, scannedAt: 1 };
  jest.mocked(loadShoppingList).mockResolvedValue([local]);
  adapter.loadItems
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ id: 'remote-1', label: 'Moon Milk', specification: '2×' }]);
  await expect(syncShoppingList()).resolves.toEqual([
    expect.objectContaining({ barcode: '123', remoteItemId: 'remote-1' }),
  ]);
  expect(adapter.addItem).toHaveBeenCalledWith(target, local);
  expect(saveShoppingList).toHaveBeenCalledWith(
    [expect.objectContaining({ remoteItemId: 'remote-1' })],
    'groceries',
  );
});

it('selects an explicitly requested local list', async () => {
  const second = { id: 'hardware', name: 'Hardware', syncTarget: target };
  jest.mocked(loadShoppingLists).mockResolvedValue([localList, second]);
  adapter.loadItems.mockResolvedValue([]);
  await syncShoppingList('hardware');
  expect(loadShoppingList).toHaveBeenCalledWith('hardware');
  expect(saveShoppingList).toHaveBeenCalledWith([], 'hardware');
});

it('reports provider-neutral list sync state', async () => {
  await expect(getListSyncState({ id: 'local', name: 'Local' })).resolves.toEqual({
    enabled: true,
    configured: false,
  });
  adapter.isEnabled.mockResolvedValueOnce(false);
  await expect(getListSyncState({ id: 'local', name: 'Local' })).resolves.toEqual({
    enabled: false,
    configured: false,
  });
  await expect(getListSyncState(localList)).resolves.toEqual({
    enabled: true,
    configured: true,
  });
  adapter.isAuthenticated.mockResolvedValueOnce(false);
  await expect(getListSyncState(localList)).resolves.toEqual({
    enabled: true,
    configured: false,
  });
});

it('enriches remotely imported barcodes with stores and product metadata', async () => {
  adapter.loadItems.mockResolvedValue([
    { id: 'remote-1', label: 'Milk', barcode: '7612345678901' },
    { id: 'remote-2', label: 'Loose carrots' },
  ]);
  jest.mocked(lookupProduct).mockResolvedValue({
    barcode: '7612345678901',
    label: 'Milk',
    exactLabel: 'Moon Milk',
    brand: 'Luna',
    imageUrl: 'https://images.example/milk.png',
    stores: ['Migros'],
    source: 'open-products-family',
    productType: 'food',
  });
  await expect(syncShoppingList()).resolves.toEqual([
    expect.objectContaining({ brand: 'Luna', stores: ['Migros'], metadataResolved: true }),
    expect.objectContaining({ barcode: 'remote:remote-2', label: 'Loose carrots' }),
  ]);
});

it('continues syncing if optional metadata enrichment is unavailable', async () => {
  adapter.loadItems.mockResolvedValue([
    { id: 'remote-1', label: 'Milk', barcode: '7612345678901' },
  ]);
  jest.mocked(lookupProduct).mockRejectedValue(new Error('offline'));
  await expect(syncShoppingList()).resolves.toEqual([
    expect.objectContaining({ barcode: '7612345678901', label: 'Milk' }),
  ]);
});

it('marks a missing metadata lookup as resolved and preserves existing metadata', async () => {
  adapter.loadItems.mockResolvedValue([
    { id: 'remote-1', label: 'Unknown', barcode: '7612345678901' },
  ]);
  jest.mocked(lookupProduct).mockResolvedValue(null);
  await expect(syncShoppingList()).resolves.toEqual([
    expect.objectContaining({ metadataResolved: true, label: 'Unknown' }),
  ]);
});

it('stays local for unmapped, disabled, or unauthenticated providers', async () => {
  const local = [{ barcode: '123', label: 'Moon Milk', scannedAt: 1 }];
  jest.mocked(loadShoppingList).mockResolvedValue(local);
  const unmapped = { id: 'groceries', name: 'Groceries' };
  jest.mocked(loadActiveShoppingList).mockResolvedValueOnce(unmapped);
  jest.mocked(loadShoppingLists).mockResolvedValueOnce([unmapped]);
  await expect(syncShoppingList()).resolves.toEqual(local);
  adapter.isEnabled.mockResolvedValueOnce(false);
  await expect(syncShoppingList()).resolves.toEqual(local);
  adapter.isAuthenticated.mockResolvedValueOnce(false);
  await expect(syncShoppingList()).resolves.toEqual(local);
  expect(adapter.loadItems).not.toHaveBeenCalled();
});

it('removes by remote ID or resolves a matching remote label through the adapter', async () => {
  await removeFromSyncedList(localList, {
    barcode: '123',
    label: 'Milk',
    scannedAt: 1,
    remoteItemId: 'remote-1',
    remoteSpecification: '2×',
  });
  expect(adapter.removeItem).toHaveBeenCalledWith(
    target,
    expect.objectContaining({ id: 'remote-1', specification: '2×' }),
  );
  adapter.loadItems.mockResolvedValue([{ id: 'remote-2', label: ' bread ' }]);
  await removeFromSyncedList(localList, { barcode: '456', label: 'Bread', scannedAt: 2 });
  expect(adapter.removeItem).toHaveBeenCalledWith(target, { id: 'remote-2', label: ' bread ' });
});

it('explicitly adds a restored item through its mapped provider', async () => {
  const item = { barcode: '7611111111111', label: 'Milk', scannedAt: 1 };
  await expect(addToSyncedList(localList, item)).resolves.toBe(true);
  expect(adapter.addItem).toHaveBeenCalledWith(target, item);

  await expect(addToSyncedList({ id: 'local', name: 'Local' }, item)).resolves.toBe(false);
  adapter.isEnabled.mockResolvedValueOnce(false);
  await expect(addToSyncedList(localList, item)).resolves.toBe(false);
  adapter.isAuthenticated.mockResolvedValueOnce(false);
  await expect(addToSyncedList(localList, item)).resolves.toBe(false);
});

it('uses a provider restore operation when returning a purchased item', async () => {
  const item = { barcode: '7611111111111', label: 'Milk', scannedAt: 1 };
  adapter.restoreItem = jest.fn().mockResolvedValue(undefined);
  await expect(restoreToSyncedList(localList, item)).resolves.toBe(true);
  expect(adapter.restoreItem).toHaveBeenCalledWith(target, item);
});

it('does not remove remotely when a list is unmapped or its provider is unavailable', async () => {
  await removeFromSyncedList(
    { id: 'local', name: 'Local' },
    { barcode: '1', label: 'Local', scannedAt: 1 },
  );
  adapter.isAuthenticated.mockResolvedValueOnce(false);
  await removeFromSyncedList(localList, { barcode: '2', label: 'Remote', scannedAt: 2 });
  adapter.isEnabled.mockResolvedValueOnce(false);
  await removeFromSyncedList(localList, { barcode: '3', label: 'Disabled', scannedAt: 3 });
  adapter.loadItems.mockResolvedValue([]);
  await removeFromSyncedList(localList, { barcode: '4', label: 'Missing', scannedAt: 4 });
  expect(adapter.removeItem).not.toHaveBeenCalled();
});
