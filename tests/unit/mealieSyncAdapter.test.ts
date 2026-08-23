import {
  addMealieItem,
  checkMealieItem,
  loadMealieItems,
  restoreMealieItem,
} from '../../src/services/mealieApi';
import { loadMealieConfig, loadMealieSyncEnabled } from '../../src/services/storage';
import { mealieSyncAdapter } from '../../src/services/sync/mealieSyncAdapter';

jest.mock('../../src/services/mealieApi', () => ({
  addMealieItem: jest.fn(),
  checkMealieItem: jest.fn(),
  loadMealieItems: jest.fn(),
  restoreMealieItem: jest.fn(),
}));
jest.mock('../../src/services/storage', () => ({
  loadMealieConfig: jest.fn(),
  loadMealieSyncEnabled: jest.fn(),
}));

const config = { baseUrl: 'https://mealie.example.test', token: 'token' };
const target = { provider: 'mealie' as const, remoteListId: 'list-1', remoteListName: 'Groceries' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(loadMealieConfig).mockResolvedValue(config);
  jest.mocked(loadMealieSyncEnabled).mockResolvedValue(true);
});

it('delegates the full provider contract to Mealie', async () => {
  const item = { barcode: 'manual:milk', label: 'Milk', scannedAt: 1 };
  jest.mocked(loadMealieItems).mockResolvedValue([{ id: 'item-1', label: 'Milk' }]);
  await expect(mealieSyncAdapter.isEnabled()).resolves.toBe(true);
  await expect(mealieSyncAdapter.isAuthenticated()).resolves.toBe(true);
  await expect(mealieSyncAdapter.loadItems(target)).resolves.toEqual([
    { id: 'item-1', label: 'Milk' },
  ]);
  await mealieSyncAdapter.addItem(target, item);
  await mealieSyncAdapter.restoreItem!(target, item);
  await mealieSyncAdapter.removeItem(target, { id: 'item-1', label: 'Milk' });
  expect(addMealieItem).toHaveBeenCalledWith(config, 'list-1', item);
  expect(restoreMealieItem).toHaveBeenCalledWith(config, 'list-1', item);
  expect(checkMealieItem).toHaveBeenCalledWith(config, 'item-1');
});

it('is independently disabled and safely handles missing configuration', async () => {
  jest.mocked(loadMealieSyncEnabled).mockResolvedValue(false);
  jest.mocked(loadMealieConfig).mockResolvedValue(null);
  const item = { barcode: 'manual:milk', label: 'Milk', scannedAt: 1 };
  await expect(mealieSyncAdapter.isEnabled()).resolves.toBe(false);
  await expect(mealieSyncAdapter.isAuthenticated()).resolves.toBe(false);
  await expect(mealieSyncAdapter.loadItems(target)).resolves.toEqual([]);
  await expect(mealieSyncAdapter.addItem(target, item)).rejects.toThrow('not configured');
  await expect(mealieSyncAdapter.restoreItem!(target, item)).rejects.toThrow('not configured');
  await expect(
    mealieSyncAdapter.removeItem(target, { id: 'item-1', label: 'Milk' }),
  ).rejects.toThrow('not configured');
});
