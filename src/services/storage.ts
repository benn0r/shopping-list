import AsyncStorage from '@react-native-async-storage/async-storage';
import * as CredentialStorage from './credentialStorage';
import {
  AppLanguage,
  BringList,
  Credentials,
  CustomBarcode,
  LookupPreferences,
  Product,
  ScanHistoryItem,
  ShoppingListItem,
} from '../types';

const CREDENTIALS_KEY = 'bring-credentials';
const LIST_KEY = 'selected-list';
const BARCODES_KEY = 'custom-barcodes';
const LOOKUP_PREFERENCES_KEY = 'lookup-preferences';
const SCAN_HISTORY_KEY = 'scan-history';
const APP_LANGUAGE_KEY = 'app-language';
const SHOPPING_LIST_KEY = 'shopping-list';
const BRING_SYNC_KEY = 'bring-sync-enabled';
const MAX_SCAN_HISTORY = 8;
const APP_LANGUAGES: AppLanguage[] = ['en', 'de', 'fr', 'it', 'pt', 'pt-BR'];
export const DEFAULT_LOOKUP_PREFERENCES: LookupPreferences = {
  language: 'auto',
  labelStyle: 'generic',
};

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
export async function loadShoppingList(): Promise<ShoppingListItem[]> {
  const value = await AsyncStorage.getItem(SHOPPING_LIST_KEY);
  return value ? JSON.parse(value) : [];
}
export async function addShoppingListItem(
  product: Product,
  label: string,
  quantity?: number,
): Promise<ShoppingListItem[]> {
  const items = await loadShoppingList();
  const existing = items.find((item) => item.barcode === product.barcode);
  const item: ShoppingListItem = {
    barcode: product.barcode,
    label,
    brand: product.brand,
    scannedAt: Date.now(),
    quantity: quantity || existing?.quantity,
  };
  const next = [item, ...items.filter((entry) => entry.barcode !== product.barcode)];
  await AsyncStorage.setItem(SHOPPING_LIST_KEY, JSON.stringify(next));
  return next;
}
export async function removeShoppingListItem(barcode: string): Promise<ShoppingListItem[]> {
  const next = (await loadShoppingList()).filter((item) => item.barcode !== barcode);
  await AsyncStorage.setItem(SHOPPING_LIST_KEY, JSON.stringify(next));
  return next;
}
