import AsyncStorage from '@react-native-async-storage/async-storage';
import * as CredentialStorage from './credentialStorage';
import {
  AppLanguage,
  BringList,
  Credentials,
  CustomBarcode,
  LookupPreferences,
  ListViewMode,
  Product,
  ScanHistoryItem,
  ShoppingListItem,
  ShoppingListDefinition,
} from '../types';

const CREDENTIALS_KEY = 'bring-credentials';
const LIST_KEY = 'selected-list';
const BARCODES_KEY = 'custom-barcodes';
const LOOKUP_PREFERENCES_KEY = 'lookup-preferences';
const SCAN_HISTORY_KEY = 'scan-history';
const APP_LANGUAGE_KEY = 'app-language';
const SHOPPING_LIST_KEY = 'shopping-list';
const BRING_SYNC_KEY = 'bring-sync-enabled';
const LIST_VIEW_MODE_KEY = 'list-view-mode';
const SHOPPING_LISTS_KEY = 'shopping-lists-v2';
const ACTIVE_SHOPPING_LIST_KEY = 'active-shopping-list-v2';
const SHOPPING_LIST_ITEMS_KEY = 'shopping-list-items-v2';
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
export async function loadListViewMode(): Promise<ListViewMode> {
  return (await AsyncStorage.getItem(LIST_VIEW_MODE_KEY)) === 'tiles' ? 'tiles' : 'list';
}
export async function saveListViewMode(mode: ListViewMode): Promise<void> {
  await AsyncStorage.setItem(LIST_VIEW_MODE_KEY, mode);
}
async function ensureShoppingLists(): Promise<ShoppingListDefinition[]> {
  const stored = await AsyncStorage.getItem(SHOPPING_LISTS_KEY);
  if (stored) return JSON.parse(stored);
  const [legacyBringList, legacyItems] = await Promise.all([
    loadSelectedList(),
    AsyncStorage.getItem(SHOPPING_LIST_KEY),
  ]);
  const initial: ShoppingListDefinition[] = [
    {
      id: 'groceries',
      name: 'Groceries',
      ...(legacyBringList ? { bringList: legacyBringList } : {}),
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
export async function setShoppingListBringMapping(
  id: string,
  bringList: BringList | null,
): Promise<ShoppingListDefinition[]> {
  const lists = (await ensureShoppingLists()).map((list) =>
    list.id === id
      ? {
          ...list,
          bringList: bringList || undefined,
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
  return stored ? JSON.parse(stored) : {};
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
