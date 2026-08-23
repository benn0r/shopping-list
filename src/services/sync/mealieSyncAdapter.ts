import { addMealieItem, checkMealieItem, loadMealieItems, restoreMealieItem } from '../mealieApi';
import { loadMealieConfig, loadMealieSyncEnabled } from '../storage';
import type { ShoppingListSyncAdapter } from './syncAdapter';

export const mealieSyncAdapter: ShoppingListSyncAdapter = {
  provider: 'mealie',
  isEnabled: loadMealieSyncEnabled,
  async isAuthenticated() {
    return Boolean(await loadMealieConfig());
  },
  async loadItems(target) {
    const config = await loadMealieConfig();
    return config ? loadMealieItems(config, target.remoteListId) : [];
  },
  async addItem(target, item) {
    const config = await loadMealieConfig();
    if (!config) throw new Error('Sync provider is not configured.');
    await addMealieItem(config, target.remoteListId, item);
  },
  async restoreItem(target, item) {
    const config = await loadMealieConfig();
    if (!config) throw new Error('Sync provider is not configured.');
    await restoreMealieItem(config, target.remoteListId, item);
  },
  async removeItem(_target, item) {
    const config = await loadMealieConfig();
    if (!config) throw new Error('Sync provider is not configured.');
    await checkMealieItem(config, item.id);
  },
};
