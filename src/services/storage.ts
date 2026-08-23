import AsyncStorage from '@react-native-async-storage/async-storage';
import * as CredentialStorage from './credentialStorage';
import {
  AppLanguage,
  BringList,
  Credentials,
  CustomBarcode,
  LookupPreferences,
  ListViewMode,
  MealieConfig,
  Product,
  ScanHistoryItem,
  ShoppingListItem,
  ShoppingListDefinition,
  ShoppingSession,
  StoreDefinition,
  SyncTarget,
} from '../types';

const CREDENTIALS_KEY = 'bring-credentials';
const LIST_KEY = 'selected-list';
const BARCODES_KEY = 'custom-barcodes';
const LOOKUP_PREFERENCES_KEY = 'lookup-preferences';
const SCAN_HISTORY_KEY = 'scan-history';
const APP_LANGUAGE_KEY = 'app-language';
const SHOPPING_LIST_KEY = 'shopping-list';
const BRING_SYNC_KEY = 'bring-sync-enabled';
const MEALIE_CONFIG_KEY = 'mealie-config';
const MEALIE_SYNC_KEY = 'mealie-sync-enabled';
const LIST_VIEW_MODE_KEY = 'list-view-mode';
const SHOPPING_LISTS_KEY = 'shopping-lists-v2';
const ACTIVE_SHOPPING_LIST_KEY = 'active-shopping-list-v2';
const SHOPPING_LIST_ITEMS_KEY = 'shopping-list-items-v2';
const STORES_KEY = 'stores-v1';
const SHOPPING_SESSIONS_KEY = 'shopping-sessions-v1';
const MAX_SCAN_HISTORY = 8;
const APP_LANGUAGES: AppLanguage[] = ['en', 'de', 'fr', 'it', 'pt', 'pt-BR'];
export const DEFAULT_LOOKUP_PREFERENCES: LookupPreferences = {
  language: 'auto',
  labelStyle: 'generic',
};
const shoppingListListeners = new Set<() => void>();
const notifyShoppingListsChanged = () => shoppingListListeners.forEach((listener) => listener());
export function subscribeShoppingLists(listener: () => void) {
  shoppingListListeners.add(listener);
  return () => {
    shoppingListListeners.delete(listener);
  };
}

export async function saveCredentials(value: Credentials) {
  await CredentialStorage.setItemAsync(CREDENTIALS_KEY, JSON.stringify(value));
}
export async function loadCredentials(): Promise<Credentials | null> {
  const value = await CredentialStorage.getItemAsync(CREDENTIALS_KEY);
  return value ? JSON.parse(value) : null;
}
export async function clearCredentials() {
  await CredentialStorage.deleteItemAsync(CREDENTIALS_KEY);
}
export async function saveMealieConfig(value: MealieConfig) {
  await CredentialStorage.setItemAsync(MEALIE_CONFIG_KEY, JSON.stringify(value));
}
export async function loadMealieConfig(): Promise<MealieConfig | null> {
  const value = await CredentialStorage.getItemAsync(MEALIE_CONFIG_KEY);
  return value ? JSON.parse(value) : null;
}
export async function clearMealieConfig() {
  await CredentialStorage.deleteItemAsync(MEALIE_CONFIG_KEY);
}
export async function saveSelectedList(value: BringList) {
  await AsyncStorage.setItem(LIST_KEY, JSON.stringify(value));
}
export async function clearSelectedList() {
  await AsyncStorage.removeItem(LIST_KEY);
}
export async function loadSelectedList(): Promise<BringList | null> {
  const value = await AsyncStorage.getItem(LIST_KEY);
  return value ? JSON.parse(value) : null;
}
export async function loadCustomBarcodes(): Promise<CustomBarcode[]> {
  const value = await AsyncStorage.getItem(BARCODES_KEY);
  return value ? JSON.parse(value) : [];
}
export async function saveCustomBarcodes(value: CustomBarcode[]) {
  await AsyncStorage.setItem(BARCODES_KEY, JSON.stringify(value));
}
export async function loadLookupPreferences(): Promise<LookupPreferences> {
  const value = await AsyncStorage.getItem(LOOKUP_PREFERENCES_KEY);
  return value
    ? { ...DEFAULT_LOOKUP_PREFERENCES, ...JSON.parse(value) }
    : DEFAULT_LOOKUP_PREFERENCES;
}
export async function saveLookupPreferences(value: LookupPreferences) {
  await AsyncStorage.setItem(LOOKUP_PREFERENCES_KEY, JSON.stringify(value));
}
export async function loadScanHistory(): Promise<ScanHistoryItem[]> {
  const value = await AsyncStorage.getItem(SCAN_HISTORY_KEY);
  return value ? JSON.parse(value) : [];
}
export function addToScanHistory(
  history: ScanHistoryItem[],
  product: Product,
  scannedAt = Date.now(),
): ScanHistoryItem[] {
  const item = {
    barcode: product.barcode,
    label: product.exactLabel || product.label,
    brand: product.brand,
    scannedAt,
  };
  return [item, ...history.filter((entry) => entry.barcode !== product.barcode)].slice(
    0,
    MAX_SCAN_HISTORY,
  );
}
export async function recordScannedProduct(product: Product): Promise<ScanHistoryItem[]> {
  const next = addToScanHistory(await loadScanHistory(), product);
  await AsyncStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(next));
  return next;
}
export async function loadAppLanguage(): Promise<AppLanguage> {
  const stored = await AsyncStorage.getItem(APP_LANGUAGE_KEY);
  return APP_LANGUAGES.includes(stored as AppLanguage) ? (stored as AppLanguage) : 'en';
}
export async function saveAppLanguage(language: AppLanguage) {
  await AsyncStorage.setItem(APP_LANGUAGE_KEY, language);
}
export async function loadBringSyncEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(BRING_SYNC_KEY)) === 'true';
}
export async function saveBringSyncEnabled(enabled: boolean) {
  await AsyncStorage.setItem(BRING_SYNC_KEY, String(enabled));
}
export async function loadMealieSyncEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(MEALIE_SYNC_KEY)) === 'true';
}
export async function saveMealieSyncEnabled(enabled: boolean) {
  await AsyncStorage.setItem(MEALIE_SYNC_KEY, String(enabled));
}
export async function loadListViewMode(): Promise<ListViewMode> {
  return (await AsyncStorage.getItem(LIST_VIEW_MODE_KEY)) === 'tiles' ? 'tiles' : 'list';
}
export async function saveListViewMode(mode: ListViewMode): Promise<void> {
  await AsyncStorage.setItem(LIST_VIEW_MODE_KEY, mode);
}
async function ensureShoppingLists(): Promise<ShoppingListDefinition[]> {
  const stored = await AsyncStorage.getItem(SHOPPING_LISTS_KEY);
  if (stored) {
    const parsed = JSON.parse(stored) as (ShoppingListDefinition & { bringList?: BringList })[];
    const migrated = parsed.map(({ bringList, ...list }) => ({
      ...list,
      ...(list.syncTarget
        ? {}
        : bringList
          ? {
              syncTarget: {
                provider: 'bring' as const,
                remoteListId: bringList.listUuid,
                remoteListName: bringList.name,
              },
            }
          : {}),
    }));
    if (parsed.some((list) => list.bringList)) {
      await AsyncStorage.setItem(SHOPPING_LISTS_KEY, JSON.stringify(migrated));
    }
    return migrated;
  }
  const [legacyBringList, legacyItems] = await Promise.all([
    loadSelectedList(),
    AsyncStorage.getItem(SHOPPING_LIST_KEY),
  ]);
  const initial: ShoppingListDefinition[] = [
    {
      id: 'groceries',
      name: 'Groceries',
      ...(legacyBringList
        ? {
            syncTarget: {
              provider: 'bring' as const,
              remoteListId: legacyBringList.listUuid,
              remoteListName: legacyBringList.name,
            },
          }
        : {}),
    },
  ];
  await Promise.all([
    AsyncStorage.setItem(SHOPPING_LISTS_KEY, JSON.stringify(initial)),
    AsyncStorage.setItem(ACTIVE_SHOPPING_LIST_KEY, 'groceries'),
    AsyncStorage.setItem(
      SHOPPING_LIST_ITEMS_KEY,
      JSON.stringify({ groceries: legacyItems ? JSON.parse(legacyItems) : [] }),
    ),
  ]);
  return initial;
}
export async function loadShoppingLists(): Promise<ShoppingListDefinition[]> {
  return ensureShoppingLists();
}
export async function loadActiveShoppingList(): Promise<ShoppingListDefinition> {
  const lists = await ensureShoppingLists();
  const activeId = await AsyncStorage.getItem(ACTIVE_SHOPPING_LIST_KEY);
  return lists.find((list) => list.id === activeId) || lists[0];
}
export async function selectActiveShoppingList(id: string): Promise<void> {
  const lists = await ensureShoppingLists();
  if (!lists.some((list) => list.id === id)) throw new Error('Unknown shopping list.');
  await AsyncStorage.setItem(ACTIVE_SHOPPING_LIST_KEY, id);
}
export async function createShoppingList(name: string): Promise<ShoppingListDefinition> {
  const lists = await ensureShoppingLists();
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Shopping-list name is required.');
  const list = {
    id: `list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: cleanName,
  };
  await AsyncStorage.setItem(SHOPPING_LISTS_KEY, JSON.stringify([...lists, list]));
  notifyShoppingListsChanged();
  return list;
}
export async function renameShoppingList(
  id: string,
  name: string,
): Promise<ShoppingListDefinition[]> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Shopping-list name is required.');
  const lists = await ensureShoppingLists();
  if (!lists.some((list) => list.id === id)) throw new Error('Unknown shopping list.');
  const next = lists.map((list) => (list.id === id ? { ...list, name: cleanName } : list));
  await AsyncStorage.setItem(SHOPPING_LISTS_KEY, JSON.stringify(next));
  notifyShoppingListsChanged();
  return next;
}
export async function deleteShoppingList(id: string): Promise<ShoppingListDefinition[]> {
  const lists = await ensureShoppingLists();
  if (!lists.some((list) => list.id === id)) throw new Error('Unknown shopping list.');
  if (lists.length === 1) throw new Error('At least one shopping list is required.');
  const next = lists.filter((list) => list.id !== id);
  const items = await loadShoppingListItems();
  delete items[id];
  const activeId = await AsyncStorage.getItem(ACTIVE_SHOPPING_LIST_KEY);
  await Promise.all([
    AsyncStorage.setItem(SHOPPING_LISTS_KEY, JSON.stringify(next)),
    AsyncStorage.setItem(SHOPPING_LIST_ITEMS_KEY, JSON.stringify(items)),
    ...(activeId === id ? [AsyncStorage.setItem(ACTIVE_SHOPPING_LIST_KEY, next[0].id)] : []),
  ]);
  notifyShoppingListsChanged();
  return next;
}
export async function setShoppingListSyncTarget(
  id: string,
  syncTarget: SyncTarget | null,
): Promise<ShoppingListDefinition[]> {
  const lists = (await ensureShoppingLists()).map((list) =>
    list.id === id
      ? {
          ...list,
          syncTarget: syncTarget || undefined,
        }
      : list,
  );
  await AsyncStorage.setItem(SHOPPING_LISTS_KEY, JSON.stringify(lists));
  notifyShoppingListsChanged();
  return lists;
}
async function loadShoppingListItems(): Promise<Record<string, ShoppingListItem[]>> {
  await ensureShoppingLists();
  const stored = await AsyncStorage.getItem(SHOPPING_LIST_ITEMS_KEY);
  if (!stored) return {};
  type LegacyItem = ShoppingListItem & {
    bringUuid?: string;
    bringSpecification?: string;
  };
  const parsed = JSON.parse(stored) as Record<string, LegacyItem[]>;
  let changed = false;
  const migrated = Object.fromEntries(
    Object.entries(parsed).map(([listId, items]) => [
      listId,
      items.map(({ bringUuid, bringSpecification, ...item }) => {
        if (bringUuid || bringSpecification) changed = true;
        return {
          ...item,
          ...(item.remoteItemId || !bringUuid ? {} : { remoteItemId: bringUuid }),
          ...(item.remoteSpecification || !bringSpecification
            ? {}
            : { remoteSpecification: bringSpecification }),
        };
      }),
    ]),
  );
  if (changed) await AsyncStorage.setItem(SHOPPING_LIST_ITEMS_KEY, JSON.stringify(migrated));
  return migrated;
}
export async function loadShoppingList(listId?: string): Promise<ShoppingListItem[]> {
  const id = listId || (await loadActiveShoppingList()).id;
  return (await loadShoppingListItems())[id] || [];
}
export async function saveShoppingList(items: ShoppingListItem[], listId?: string): Promise<void> {
  const id = listId || (await loadActiveShoppingList()).id;
  const allItems = await loadShoppingListItems();
  await AsyncStorage.setItem(SHOPPING_LIST_ITEMS_KEY, JSON.stringify({ ...allItems, [id]: items }));
}
export async function addShoppingListItem(
  product: Product,
  label: string,
  quantity?: number,
  listId?: string,
): Promise<ShoppingListItem[]> {
  const items = await loadShoppingList(listId);
  const existing = items.find((item) => item.barcode === product.barcode);
  const item: ShoppingListItem = {
    barcode: product.barcode,
    label,
    brand: product.brand,
    imageUrl: product.imageUrl,
    scannedAt: Date.now(),
    quantity: quantity || existing?.quantity,
    source: product.source,
    productType: product.productType,
    stores: product.stores,
  };
  const next = [item, ...items.filter((entry) => entry.barcode !== product.barcode)];
  await saveShoppingList(next, listId);
  return next;
}
export async function removeShoppingListItem(
  barcode: string,
  listId?: string,
): Promise<ShoppingListItem[]> {
  const next = (await loadShoppingList(listId)).filter((item) => item.barcode !== barcode);
  await saveShoppingList(next, listId);
  return next;
}

export async function loadStores(): Promise<StoreDefinition[]> {
  const stored = await AsyncStorage.getItem(STORES_KEY);
  return stored ? JSON.parse(stored) : [];
}
export async function createStore(name: string): Promise<StoreDefinition[]> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Store name is required.');
  const stores = await loadStores();
  const store = {
    id: `store-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: cleanName,
  };
  const next = [...stores, store];
  await AsyncStorage.setItem(STORES_KEY, JSON.stringify(next));
  return next;
}
export async function renameStore(id: string, name: string): Promise<StoreDefinition[]> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Store name is required.');
  const stores = await loadStores();
  if (!stores.some((store) => store.id === id)) throw new Error('Unknown store.');
  const next = stores.map((store) => (store.id === id ? { ...store, name: cleanName } : store));
  await AsyncStorage.setItem(STORES_KEY, JSON.stringify(next));
  return next;
}
export async function deleteStore(id: string): Promise<StoreDefinition[]> {
  const stores = await loadStores();
  if (!stores.some((store) => store.id === id)) throw new Error('Unknown store.');
  const next = stores.filter((store) => store.id !== id);
  await AsyncStorage.setItem(STORES_KEY, JSON.stringify(next));
  return next;
}
export async function loadShoppingSessions(): Promise<ShoppingSession[]> {
  const stored = await AsyncStorage.getItem(SHOPPING_SESSIONS_KEY);
  return stored ? JSON.parse(stored) : [];
}
export async function deleteShoppingSession(sessionId: string): Promise<ShoppingSession[]> {
  const sessions = await loadShoppingSessions();
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session?.completedAt) throw new Error('Unknown completed shopping.');
  const next = sessions.filter((candidate) => candidate.id !== sessionId);
  await AsyncStorage.setItem(SHOPPING_SESSIONS_KEY, JSON.stringify(next));
  return next;
}
export async function createShoppingSession(
  store: StoreDefinition,
  listOrLists: ShoppingListDefinition | ShoppingListDefinition[],
  startedAt = Date.now(),
): Promise<ShoppingSession> {
  const sessions = await loadShoppingSessions();
  const lists = Array.isArray(listOrLists) ? listOrLists : [listOrLists];
  if (!lists.length) throw new Error('At least one shopping list is required.');
  const [firstList] = lists;
  const session: ShoppingSession = {
    id: `shopping-${startedAt}-${Math.random().toString(36).slice(2, 8)}`,
    storeId: store.id,
    storeName: store.name,
    listId: firstList.id,
    listName: firstList.name,
    listIds: lists.map((list) => list.id),
    listNames: lists.map((list) => list.name),
    startedAt,
    purchasedItems: [],
  };
  await AsyncStorage.setItem(SHOPPING_SESSIONS_KEY, JSON.stringify([session, ...sessions]));
  return session;
}
export async function recordShoppingPurchase(
  sessionId: string,
  item: ShoppingListItem,
  purchasedAt = Date.now(),
  sourceList?: ShoppingListDefinition,
): Promise<ShoppingSession> {
  const sessions = await loadShoppingSessions();
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session || session.completedAt) throw new Error('No active shopping found.');
  const purchasedItem = {
    ...item,
    purchasedAt,
    sourceListId: sourceList?.id || session.listId,
    sourceListName: sourceList?.name || session.listName,
  };
  const updated = {
    ...session,
    purchasedItems: [purchasedItem, ...session.purchasedItems],
  };
  await AsyncStorage.setItem(
    SHOPPING_SESSIONS_KEY,
    JSON.stringify(sessions.map((candidate) => (candidate.id === sessionId ? updated : candidate))),
  );
  return updated;
}
export async function restoreShoppingPurchase(
  sessionId: string,
  barcode: string,
  sourceListId?: string,
): Promise<ShoppingSession> {
  const sessions = await loadShoppingSessions();
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session || session.completedAt) throw new Error('No active shopping found.');
  const purchasedItem = session.purchasedItems.find(
    (item) =>
      item.barcode === barcode &&
      (!sourceListId || (item.sourceListId || session.listId) === sourceListId),
  );
  if (!purchasedItem) throw new Error('Unknown purchased item.');
  const {
    purchasedAt: _purchasedAt,
    sourceListId: _sourceListId,
    sourceListName: _sourceListName,
    remoteItemId: _remoteItemId,
    remoteSpecification: _remoteSpecification,
    ...shoppingListItem
  } = purchasedItem;
  const destinationListId = purchasedItem.sourceListId || session.listId;
  const listItems = await loadShoppingList(destinationListId);
  await saveShoppingList(
    [shoppingListItem, ...listItems.filter((item) => item.barcode !== barcode)],
    destinationListId,
  );
  const updated = {
    ...session,
    purchasedItems: session.purchasedItems.filter((item) => item !== purchasedItem),
  };
  await AsyncStorage.setItem(
    SHOPPING_SESSIONS_KEY,
    JSON.stringify(sessions.map((candidate) => (candidate.id === sessionId ? updated : candidate))),
  );
  return updated;
}
export async function completeShoppingSession(
  sessionId: string,
  completedAt = Date.now(),
): Promise<ShoppingSession> {
  const sessions = await loadShoppingSessions();
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session) throw new Error('Unknown shopping.');
  const updated = { ...session, completedAt };
  await AsyncStorage.setItem(
    SHOPPING_SESSIONS_KEY,
    JSON.stringify(sessions.map((candidate) => (candidate.id === sessionId ? updated : candidate))),
  );
  return updated;
}
