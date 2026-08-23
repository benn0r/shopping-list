import type { RemoteShoppingListItem, ShoppingListDefinition, ShoppingListItem } from '../types';
import { lookupProduct } from './productLookup';
import {
  loadCustomBarcodes,
  loadLookupPreferences,
  loadActiveShoppingList,
  loadShoppingList,
  loadShoppingLists,
  saveShoppingList,
} from './storage';
import { getSyncAdapter, getSyncAdapters } from './sync/syncAdapters';

const normalized = (value: string) => value.trim().toLocaleLowerCase();

export function reconcileRemoteItems(
  localItems: ShoppingListItem[],
  remoteItems: RemoteShoppingListItem[],
  now = Date.now(),
): ShoppingListItem[] {
  const remaining = new Map(remoteItems.map((item) => [item.id, item]));
  const result: ShoppingListItem[] = [];
  for (const local of localItems) {
    if (local.remoteItemId) {
      const remote = remaining.get(local.remoteItemId);
      if (!remote) continue;
      remaining.delete(remote.id);
      result.push({
        ...local,
        barcode: remote.barcode || local.barcode,
        label: remote.label,
        quantity: remote.quantity ?? local.quantity,
        unit: remote.unit ?? local.unit,
        remoteSpecification: remote.specification,
      });
      continue;
    }
    const remote = [...remaining.values()].find(
      (item) => normalized(item.label) === normalized(local.label),
    );
    if (!remote) {
      result.push(local);
      continue;
    }
    remaining.delete(remote.id);
    result.push({
      ...local,
      barcode: remote.barcode || local.barcode,
      quantity: remote.quantity ?? local.quantity,
      unit: remote.unit ?? local.unit,
      remoteItemId: remote.id,
      remoteSpecification: remote.specification,
    });
  }
  for (const remote of remaining.values()) {
    result.push({
      barcode: remote.barcode || `remote:${remote.id}`,
      remoteItemId: remote.id,
      remoteSpecification: remote.specification,
      label: remote.label,
      quantity: remote.quantity,
      unit: remote.unit,
      scannedAt: now,
    });
  }
  return result;
}

async function enrichBarcodeItems(items: ShoppingListItem[]) {
  const candidates = items.filter(
    (item) => /^\d{8,14}$/.test(item.barcode) && !item.imageUrl && !item.metadataResolved,
  );
  if (candidates.length === 0) return items;
  const [customBarcodes, preferences] = await Promise.all([
    loadCustomBarcodes(),
    loadLookupPreferences(),
  ]);
  const enriched = new Map(
    await Promise.all(
      candidates.map(async (item) => {
        try {
          const product = await lookupProduct(item.barcode, customBarcodes, preferences);
          return [
            item.barcode,
            {
              ...item,
              ...(product?.brand ? { brand: product.brand } : {}),
              ...(product?.imageUrl ? { imageUrl: product.imageUrl } : {}),
              ...(product?.stores?.length ? { stores: product.stores } : {}),
              source: product?.source || item.source,
              productType: product?.productType || item.productType,
              metadataResolved: true,
            },
          ] as const;
        } catch {
          return [item.barcode, item] as const;
        }
      }),
    ),
  );
  return items.map((item) => enriched.get(item.barcode) || item);
}

export async function getListSyncState(list: ShoppingListDefinition) {
  if (!list.syncTarget) {
    const enabledStates = await Promise.all(
      getSyncAdapters().map((adapter) => adapter.isEnabled()),
    );
    return { enabled: enabledStates.some(Boolean), configured: false };
  }
  const adapter = getSyncAdapter(list.syncTarget.provider);
  const [enabled, authenticated] = await Promise.all([
    adapter.isEnabled(),
    adapter.isAuthenticated(),
  ]);
  return { enabled, configured: enabled && authenticated };
}

export async function syncShoppingList(listId?: string): Promise<ShoppingListItem[]> {
  const [lists, activeList] = await Promise.all([loadShoppingLists(), loadActiveShoppingList()]);
  const localList = lists.find((candidate) => candidate.id === listId) || activeList;
  const localItems = await loadShoppingList(localList.id);
  if (!localList.syncTarget) return localItems;
  const adapter = getSyncAdapter(localList.syncTarget.provider);
  if (!(await adapter.isEnabled()) || !(await adapter.isAuthenticated())) return localItems;

  let next = reconcileRemoteItems(localItems, await adapter.loadItems(localList.syncTarget));
  const pending = next.filter((item) => !item.remoteItemId);
  if (pending.length > 0) {
    await Promise.all(pending.map((item) => adapter.addItem(localList.syncTarget!, item)));
    next = reconcileRemoteItems(next, await adapter.loadItems(localList.syncTarget));
  }
  next = await enrichBarcodeItems(next);
  await saveShoppingList(next, localList.id);
  return next;
}

export async function removeFromSyncedList(
  list: ShoppingListDefinition,
  item: ShoppingListItem,
): Promise<void> {
  if (!list.syncTarget) return;
  const adapter = getSyncAdapter(list.syncTarget.provider);
  if (!(await adapter.isEnabled()) || !(await adapter.isAuthenticated())) return;
  let remote: RemoteShoppingListItem | undefined = item.remoteItemId
    ? {
        id: item.remoteItemId,
        label: item.label,
        quantity: item.quantity,
        unit: item.unit,
        specification: item.remoteSpecification,
        barcode: item.barcode,
      }
    : undefined;
  if (!remote) {
    remote = (await adapter.loadItems(list.syncTarget)).find(
      (candidate) => normalized(candidate.label) === normalized(item.label),
    );
  }
  if (remote) await adapter.removeItem(list.syncTarget, remote);
}

export async function addToSyncedList(
  list: ShoppingListDefinition,
  item: ShoppingListItem,
): Promise<boolean> {
  if (!list.syncTarget) return false;
  const adapter = getSyncAdapter(list.syncTarget.provider);
  if (!(await adapter.isEnabled()) || !(await adapter.isAuthenticated())) return false;
  await adapter.addItem(list.syncTarget, item);
  return true;
}

export async function restoreToSyncedList(
  list: ShoppingListDefinition,
  item: ShoppingListItem,
): Promise<boolean> {
  if (!list.syncTarget) return false;
  const adapter = getSyncAdapter(list.syncTarget.provider);
  if (!(await adapter.isEnabled()) || !(await adapter.isAuthenticated())) return false;
  await (adapter.restoreItem
    ? adapter.restoreItem(list.syncTarget, item)
    : adapter.addItem(list.syncTarget, item));
  return true;
}
