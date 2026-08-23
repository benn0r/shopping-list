import { BringItem, ShoppingListItem } from '../types';
import { addItem, loadItems } from './bringApi';
import { lookupProduct } from './productLookup';
import {
  loadCredentials,
  loadCustomBarcodes,
  loadLookupPreferences,
  loadActiveShoppingList,
  loadShoppingList,
  loadShoppingLists,
  saveShoppingList,
} from './storage';

const normalized = (value: string) => value.trim().toLocaleLowerCase();

export function reconcileBringItems(
  localItems: ShoppingListItem[],
  bringItems: BringItem[],
  now = Date.now(),
): ShoppingListItem[] {
  const remaining = new Map(bringItems.map((item) => [item.uuid, item]));
  const result: ShoppingListItem[] = [];
  for (const local of localItems) {
    if (local.bringUuid) {
      const remote = remaining.get(local.bringUuid);
      if (!remote) continue;
      remaining.delete(remote.uuid);
      result.push({
        ...local,
        barcode: remote.barcode || local.barcode,
        label: remote.label,
        bringSpecification: remote.specification,
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
    remaining.delete(remote.uuid);
    result.push({
      ...local,
      barcode: remote.barcode || local.barcode,
      bringUuid: remote.uuid,
      bringSpecification: remote.specification,
    });
  }
  for (const remote of remaining.values()) {
    result.push({
      barcode: remote.barcode || `bring:${remote.uuid}`,
      bringUuid: remote.uuid,
      bringSpecification: remote.specification,
      label: remote.label,
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

export async function syncShoppingListWithBring(listId?: string): Promise<ShoppingListItem[]> {
  const [credentials, lists, activeList] = await Promise.all([
    loadCredentials(),
    loadShoppingLists(),
    loadActiveShoppingList(),
  ]);
  const localList = lists.find((candidate) => candidate.id === listId) || activeList;
  const localItems = await loadShoppingList(localList.id);
  const list = localList.bringList;
  if (!credentials || !list) return localItems;
  let next = reconcileBringItems(localItems, await loadItems(credentials, list.listUuid));
  const pending = next.filter((item) => !item.bringUuid);
  if (pending.length > 0) {
    await Promise.all(
      pending.map((item) =>
        addItem(credentials, list.listUuid, item.label, item.quantity, item.barcode),
      ),
    );
    next = reconcileBringItems(next, await loadItems(credentials, list.listUuid));
  }
  next = await enrichBarcodeItems(next);
  await saveShoppingList(next, localList.id);
  return next;
}
