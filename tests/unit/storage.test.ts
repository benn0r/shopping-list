import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  clearCredentials,
  addShoppingListItem,
  clearSelectedList,
  DEFAULT_LOOKUP_PREFERENCES,
  loadAppLanguage,
  loadBringSyncEnabled,
  loadCredentials,
  loadCustomBarcodes,
  loadLookupPreferences,
  loadScanHistory,
  loadSelectedList,
  loadShoppingList,
  removeShoppingListItem,
  recordScannedProduct,
  saveAppLanguage,
  saveBringSyncEnabled,
  saveCredentials,
  saveCustomBarcodes,
  saveLookupPreferences,
  saveSelectedList,
} from '../../src/services/storage';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
});

afterEach(() => jest.restoreAllMocks());

describe('persistent settings', () => {
  it('saves, loads, and clears credentials through secure storage', async () => {
    const credentials = { email: 'pilot@moon.example', password: 'lunar-secret' };

    await saveCredentials(credentials);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'bring-credentials',
      JSON.stringify(credentials),
    );

    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify(credentials));
    await expect(loadCredentials()).resolves.toEqual(credentials);

    await clearCredentials();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('bring-credentials');
  });

  it('returns no credentials when secure storage is empty', async () => {
    await expect(loadCredentials()).resolves.toBeNull();
  });

  it('saves, loads, and clears the selected list', async () => {
    const list = { listUuid: 'moon-list', name: 'Moon Supplies' };

    await saveSelectedList(list);
    await expect(loadSelectedList()).resolves.toEqual(list);

    await clearSelectedList();
    await expect(loadSelectedList()).resolves.toBeNull();
  });

  it('returns an empty custom-barcode list and persists replacements', async () => {
    await expect(loadCustomBarcodes()).resolves.toEqual([]);

    const barcodes = [{ barcode: '7611111111111', label: 'Moon Milk' }];
    await saveCustomBarcodes(barcodes);
    await expect(loadCustomBarcodes()).resolves.toEqual(barcodes);
  });

  it('uses default lookup preferences and merges older stored settings', async () => {
    await expect(loadLookupPreferences()).resolves.toEqual(DEFAULT_LOOKUP_PREFERENCES);

    await AsyncStorage.setItem('lookup-preferences', JSON.stringify({ language: 'de' }));
    await expect(loadLookupPreferences()).resolves.toEqual({
      language: 'de',
      labelStyle: 'generic',
    });

    await saveLookupPreferences({ language: 'fr', labelStyle: 'exact' });
    await expect(loadLookupPreferences()).resolves.toEqual({
      language: 'fr',
      labelStyle: 'exact',
    });
  });

  it('records a scanned product and exposes the stored history', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1234);

    await expect(
      recordScannedProduct({
        barcode: '7611111111111',
        label: 'Generic drink',
        exactLabel: 'Comet Cola',
        brand: 'Comet',
        source: 'open-products-family',
      }),
    ).resolves.toEqual([
      {
        barcode: '7611111111111',
        label: 'Comet Cola',
        brand: 'Comet',
        scannedAt: 1234,
      },
    ]);
    await expect(loadScanHistory()).resolves.toHaveLength(1);
  });

  it('returns an empty scan history when none has been recorded', async () => {
    await expect(loadScanHistory()).resolves.toEqual([]);
  });

  it('defaults the app language to English and persists another language', async () => {
    await expect(loadAppLanguage()).resolves.toBe('en');

    await saveAppLanguage('pt-BR');
    await expect(loadAppLanguage()).resolves.toBe('pt-BR');
  });

  it('stores the Bring sync preference and defaults it to disabled', async () => {
    await expect(loadBringSyncEnabled()).resolves.toBe(false);
    await saveBringSyncEnabled(true);
    await expect(loadBringSyncEnabled()).resolves.toBe(true);
  });

  it('adds, replaces, and removes local shopping-list items', async () => {
    const product = {
      barcode: '7611111111111',
      label: 'Drink',
      exactLabel: 'Comet Cola',
      brand: 'Comet',
      source: 'open-products-family' as const,
    };
    await addShoppingListItem(product, 'Cola', 2);
    await addShoppingListItem(product, 'Party Cola', 3);
    await expect(loadShoppingList()).resolves.toEqual([
      expect.objectContaining({ barcode: product.barcode, label: 'Party Cola', quantity: 3 }),
    ]);
    await removeShoppingListItem(product.barcode);
    await expect(loadShoppingList()).resolves.toEqual([]);
  });

  it('falls back to English for an unsupported stored app language', async () => {
    await AsyncStorage.setItem('app-language', 'xx');
    await expect(loadAppLanguage()).resolves.toBe('en');
  });

  it.each([
    ['selected-list', loadSelectedList],
    ['custom-barcodes', loadCustomBarcodes],
    ['lookup-preferences', loadLookupPreferences],
    ['scan-history', loadScanHistory],
  ])('rejects corrupted JSON stored under %s', async (key, loader) => {
    await AsyncStorage.setItem(key, '{not-json');
    await expect(loader()).rejects.toBeInstanceOf(SyntaxError);
  });

  it('propagates secure-storage errors', async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('keychain unavailable'));
    await expect(loadCredentials()).rejects.toThrow('keychain unavailable');
  });

  it('rejects corrupted credential JSON', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('{not-json');
    await expect(loadCredentials()).rejects.toBeInstanceOf(SyntaxError);
  });

  it('propagates failed secure writes and deletes', async () => {
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('keychain write failed'));
    await expect(
      saveCredentials({ email: 'pilot@moon.example', password: 'secret' }),
    ).rejects.toThrow('keychain write failed');

    jest.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error('keychain locked'));
    await expect(clearCredentials()).rejects.toThrow('keychain locked');
  });

  it('propagates failed regular-storage reads, writes, and deletes', async () => {
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('read failed'));
    await expect(loadSelectedList()).rejects.toThrow('read failed');

    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('write failed'));
    await expect(saveSelectedList({ listUuid: 'moon', name: 'Moon' })).rejects.toThrow(
      'write failed',
    );

    jest.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error('delete failed'));
    await expect(clearSelectedList()).rejects.toThrow('delete failed');
  });
});
