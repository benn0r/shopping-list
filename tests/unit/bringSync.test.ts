import { addItem, loadItems } from '../../src/services/bringApi';
import { reconcileBringItems, syncShoppingListWithBring } from '../../src/services/bringSync';
import { lookupProduct } from '../../src/services/productLookup';
import {
  loadCredentials,
  loadCustomBarcodes,
  loadLookupPreferences,
  loadActiveShoppingList,
  loadShoppingList,
  loadShoppingLists,
  saveShoppingList,
} from '../../src/services/storage';

jest.mock('../../src/services/bringApi', () => ({ addItem: jest.fn(), loadItems: jest.fn() }));
jest.mock('../../src/services/productLookup', () => ({ lookupProduct: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  loadCredentials: jest.fn(),
  loadCustomBarcodes: jest.fn(),
  loadLookupPreferences: jest.fn(),
  loadActiveShoppingList: jest.fn(),
  loadShoppingList: jest.fn(),
  loadShoppingLists: jest.fn(),
  saveShoppingList: jest.fn(),
}));

const credentials = { email: 'pilot@example.com', password: 'secret' };
const list = { listUuid: 'moon-list', name: 'Moon List' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(loadCredentials).mockResolvedValue(credentials);
  jest
    .mocked(loadActiveShoppingList)
    .mockResolvedValue({ id: 'groceries', name: 'Groceries', bringList: list });
  jest
    .mocked(loadShoppingLists)
    .mockResolvedValue([{ id: 'groceries', name: 'Groceries', bringList: list }]);
  jest.mocked(loadShoppingList).mockResolvedValue([]);
  jest.mocked(loadCustomBarcodes).mockResolvedValue([]);
  jest.mocked(loadLookupPreferences).mockResolvedValue({
    language: 'auto',
    labelStyle: 'generic',
  });
  jest.mocked(loadItems).mockResolvedValue([]);
  jest.mocked(addItem).mockResolvedValue(undefined);
});

it('preserves scanned metadata, imports Bring additions, and removes missing synced items', () => {
  const result = reconcileBringItems(
    [
      {
        barcode: '7611111111111',
        label: 'Moon Milk',
        brand: 'Luna',
        imageUrl: 'https://images.example/milk.png',
        scannedAt: 1,
      },
      { barcode: 'old', label: 'Old Bread', scannedAt: 2, bringUuid: 'removed-id' },
    ],
    [
      { uuid: 'milk-id', label: 'moon milk', specification: '2×' },
      {
        uuid: 'bread-id',
        label: 'Star Bread',
        specification: 'EAN:7612222222222',
        barcode: '7612222222222',
      },
    ],
    99,
  );

  expect(result).toEqual([
    expect.objectContaining({
      barcode: '7611111111111',
      bringUuid: 'milk-id',
      imageUrl: 'https://images.example/milk.png',
    }),
    expect.objectContaining({
      barcode: '7612222222222',
      bringUuid: 'bread-id',
      label: 'Star Bread',
      scannedAt: 99,
    }),
  ]);
});

it('updates the Bring label while retaining metadata for an already linked item', () => {
  expect(
    reconcileBringItems(
      [{ barcode: '123', label: 'Old name', scannedAt: 1, bringUuid: 'remote-1' }],
      [{ uuid: 'remote-1', label: 'New name' }],
    ),
  ).toEqual([expect.objectContaining({ barcode: '123', label: 'New name' })]);
});

it('pushes pending local items and then persists the reconciled Bring state', async () => {
  const local = { barcode: '123', label: 'Moon Milk', quantity: 2, scannedAt: 1 };
  jest.mocked(loadShoppingList).mockResolvedValue([local]);
  jest
    .mocked(loadItems)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ uuid: 'remote-1', label: 'Moon Milk', specification: '2×' }]);

  await expect(syncShoppingListWithBring()).resolves.toEqual([
    expect.objectContaining({ barcode: '123', bringUuid: 'remote-1' }),
  ]);
  expect(addItem).toHaveBeenCalledWith(credentials, list.listUuid, 'Moon Milk', 2, '123');
  expect(saveShoppingList).toHaveBeenCalledWith(
    [expect.objectContaining({ barcode: '123', bringUuid: 'remote-1' })],
    'groceries',
  );
});

it('enriches a barcode received through Bring with product metadata', async () => {
  jest.mocked(loadItems).mockResolvedValue([
    {
      uuid: 'remote-1',
      label: 'Milk for breakfast',
      specification: 'EAN:7612345678901',
      barcode: '7612345678901',
    },
  ]);
  jest.mocked(lookupProduct).mockResolvedValue({
    barcode: '7612345678901',
    label: 'Milk',
    exactLabel: 'Moon Milk',
    brand: 'Luna',
    imageUrl: 'https://images.example/milk.png',
    source: 'open-products-family',
  });

  await expect(syncShoppingListWithBring()).resolves.toEqual([
    expect.objectContaining({
      barcode: '7612345678901',
      label: 'Milk for breakfast',
      brand: 'Luna',
      imageUrl: 'https://images.example/milk.png',
      metadataResolved: true,
    }),
  ]);
  expect(lookupProduct).toHaveBeenCalledWith('7612345678901', [], {
    language: 'auto',
    labelStyle: 'generic',
  });
});

it('enriches stores and product type while leaving non-barcode items unchanged', async () => {
  jest.mocked(loadItems).mockResolvedValue([
    { uuid: 'remote-1', label: 'Bread', barcode: '7612345678901' },
    { uuid: 'remote-2', label: 'Loose carrots' },
  ]);
  jest.mocked(lookupProduct).mockResolvedValue({
    barcode: '7612345678901',
    label: 'Bread',
    exactLabel: 'Bread',
    stores: ['Migros', 'Coop'],
    source: 'open-products-family',
    productType: 'food',
  });

  await expect(syncShoppingListWithBring()).resolves.toEqual([
    expect.objectContaining({
      stores: ['Migros', 'Coop'],
      productType: 'food',
      metadataResolved: true,
    }),
    expect.objectContaining({ label: 'Loose carrots', barcode: 'bring:remote-2' }),
  ]);
});

it('keeps Bring sync working when metadata enrichment is temporarily unavailable', async () => {
  jest
    .mocked(loadItems)
    .mockResolvedValue([{ uuid: 'remote-1', label: 'Milk', barcode: '7612345678901' }]);
  jest.mocked(lookupProduct).mockRejectedValue(new Error('offline'));

  await expect(syncShoppingListWithBring()).resolves.toEqual([
    expect.objectContaining({ barcode: '7612345678901', label: 'Milk' }),
  ]);
  expect(saveShoppingList).toHaveBeenCalled();
});

it('stays local when Bring is not fully configured', async () => {
  const local = [{ barcode: '123', label: 'Moon Milk', scannedAt: 1 }];
  jest.mocked(loadShoppingList).mockResolvedValue(local);
  jest.mocked(loadCredentials).mockResolvedValue(null);

  await expect(syncShoppingListWithBring()).resolves.toEqual(local);
  expect(loadItems).not.toHaveBeenCalled();
  expect(saveShoppingList).not.toHaveBeenCalled();
});

it('also stays local when the local list has no Bring mapping', async () => {
  const local = [{ barcode: '123', label: 'Moon Milk', scannedAt: 1 }];
  jest.mocked(loadShoppingList).mockResolvedValue(local);
  const unmapped = { id: 'groceries', name: 'Groceries' };
  jest.mocked(loadActiveShoppingList).mockResolvedValue(unmapped);
  jest.mocked(loadShoppingLists).mockResolvedValue([unmapped]);
  await expect(syncShoppingListWithBring()).resolves.toEqual(local);
});

it('does not push anything when every local item is already represented in Bring', async () => {
  const local = [{ barcode: '123', label: 'Moon Milk', scannedAt: 1, bringUuid: 'remote-1' }];
  jest.mocked(loadShoppingList).mockResolvedValue(local);
  jest.mocked(loadItems).mockResolvedValue([{ uuid: 'remote-1', label: 'Moon Milk' }]);
  await syncShoppingListWithBring();
  expect(addItem).not.toHaveBeenCalled();
  expect(loadItems).toHaveBeenCalledTimes(1);
});
