import { addItem, loadItems, removeItem, restoreItem } from '../bringApi';
import { loadBringSyncEnabled, loadCredentials } from '../storage';
import type { ShoppingListSyncAdapter } from './syncAdapter';

export const bringSyncAdapter: ShoppingListSyncAdapter = {
  provider: 'bring',
  isEnabled: loadBringSyncEnabled,
  async isAuthenticated() {
    return Boolean(await loadCredentials());
  },
  async loadItems(target) {
    const credentials = await loadCredentials();
    if (!credentials) return [];
    return (await loadItems(credentials, target.remoteListId)).map((item) => ({
      id: item.uuid,
      label: item.label,
      specification: item.specification,
      barcode: item.barcode,
    }));
  },
  async addItem(target, item) {
    const credentials = await loadCredentials();
    if (!credentials) throw new Error('Sync provider is not configured.');
    await addItem(credentials, target.remoteListId, item.label, item.quantity, item.barcode);
  },
  async restoreItem(target, item) {
    const credentials = await loadCredentials();
    if (!credentials) throw new Error('Sync provider is not configured.');
    await restoreItem(credentials, target.remoteListId, {
      ...(item.remoteItemId ? { uuid: item.remoteItemId } : {}),
      label: item.label,
      specification: item.remoteSpecification,
      barcode: item.barcode,
    });
  },
  async removeItem(target, item) {
    const credentials = await loadCredentials();
    if (!credentials) throw new Error('Sync provider is not configured.');
    await removeItem(credentials, target.remoteListId, {
      uuid: item.id,
      label: item.label,
      specification: item.specification,
      barcode: item.barcode,
    });
  },
};
