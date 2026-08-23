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
  loadListViewMode,
  loadMealieConfig,
  loadMealieSyncEnabled,
  loadScanHistory,
  loadSelectedList,
  loadShoppingList,
  loadShoppingLists,
  loadShoppingSessions,
  loadStores,
  loadActiveShoppingList,
  createShoppingList,
  createShoppingSession,
  createStore,
  deleteShoppingList,
  deleteShoppingSession,
  deleteStore,
  selectActiveShoppingList,
  setShoppingListSyncTarget,
  subscribeShoppingLists,
  removeShoppingListItem,
  renameShoppingList,
  renameStore,
  recordShoppingPurchase,
  restoreShoppingPurchase,
  completeShoppingSession,
  recordScannedProduct,
  saveAppLanguage,
  saveBringSyncEnabled,
  saveCredentials,
  saveCustomBarcodes,
  saveLookupPreferences,
  saveListViewMode,
  saveMealieConfig,
  saveMealieSyncEnabled,
  clearMealieConfig,
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

  it('defaults to list view and persists the selected list view mode', async () => {
    await expect(loadListViewMode()).resolves.toBe('list');
    await saveListViewMode('tiles');
    await expect(loadListViewMode()).resolves.toBe('tiles');

    await AsyncStorage.setItem('list-view-mode', 'unsupported');
    await expect(loadListViewMode()).resolves.toBe('list');
  });

  it('adds, replaces, and removes local shopping-list items', async () => {
    const product = {
      barcode: '7611111111111',
      label: 'Drink',
      exactLabel: 'Comet Cola',
      brand: 'Comet',
      imageUrl: 'https://images.example/cola.png',
      source: 'open-products-family' as const,
    };
    await addShoppingListItem(product, 'Cola', 2);
    await addShoppingListItem(product, 'Party Cola', 3);
    await expect(loadShoppingList()).resolves.toEqual([
      expect.objectContaining({
        barcode: product.barcode,
        label: 'Party Cola',
        quantity: 3,
        imageUrl: 'https://images.example/cola.png',
      }),
    ]);
    await removeShoppingListItem(product.barcode);
    await expect(loadShoppingList()).resolves.toEqual([]);
  });

  it('migrates the legacy list and Bring mapping into Groceries', async () => {
    await saveSelectedList({ listUuid: 'bring-groceries', name: 'Shared Groceries' });
    await AsyncStorage.setItem(
      'shopping-list',
      JSON.stringify([{ barcode: '123', label: 'Legacy item', scannedAt: 1 }]),
    );

    await expect(loadShoppingLists()).resolves.toEqual([
      {
        id: 'groceries',
        name: 'Groceries',
        syncTarget: {
          provider: 'bring',
          remoteListId: 'bring-groceries',
          remoteListName: 'Shared Groceries',
        },
      },
    ]);
    await expect(loadShoppingList('groceries')).resolves.toEqual([
      { barcode: '123', label: 'Legacy item', scannedAt: 1 },
    ]);
  });

  it('migrates existing Bring-specific list and item fields to generic sync metadata', async () => {
    await AsyncStorage.setItem(
      'shopping-lists-v2',
      JSON.stringify([
        {
          id: 'groceries',
          name: 'Groceries',
          bringList: { listUuid: 'remote-list', name: 'Shared List' },
        },
      ]),
    );
    await AsyncStorage.setItem('active-shopping-list-v2', 'groceries');
    await AsyncStorage.setItem(
      'shopping-list-items-v2',
      JSON.stringify({
        groceries: [
          {
            barcode: '123',
            label: 'Milk',
            scannedAt: 1,
            bringUuid: 'remote-item',
            bringSpecification: '2×',
          },
        ],
      }),
    );

    await expect(loadShoppingLists()).resolves.toEqual([
      {
        id: 'groceries',
        name: 'Groceries',
        syncTarget: {
          provider: 'bring',
          remoteListId: 'remote-list',
          remoteListName: 'Shared List',
        },
      },
    ]);
    await expect(loadShoppingList('groceries')).resolves.toEqual([
      {
        barcode: '123',
        label: 'Milk',
        scannedAt: 1,
        remoteItemId: 'remote-item',
        remoteSpecification: '2×',
      },
    ]);
  });

  it('keeps items and Bring mappings separate for every local list', async () => {
    const second = await createShoppingList('Hardware');
    await setShoppingListSyncTarget(second.id, {
      provider: 'bring',
      remoteListId: 'bring-hardware',
      remoteListName: 'Shared Hardware',
    });
    await selectActiveShoppingList(second.id);
    await addShoppingListItem(
      { barcode: 'manual:1', label: 'Screws', exactLabel: 'Screws', source: 'custom' },
      'Screws',
      undefined,
      second.id,
    );

    await expect(loadActiveShoppingList()).resolves.toMatchObject({
      id: second.id,
      syncTarget: { provider: 'bring', remoteListId: 'bring-hardware' },
    });
    await expect(loadShoppingList(second.id)).resolves.toHaveLength(1);
    await expect(loadShoppingList('groceries')).resolves.toEqual([]);
  });

  it('validates list selection and creation, removes mappings, and notifies subscribers', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeShoppingLists(listener);

    await expect(createShoppingList('   ')).rejects.toThrow('Shopping-list name is required.');
    await expect(selectActiveShoppingList('missing')).rejects.toThrow('Unknown shopping list.');

    const second = await createShoppingList('  Pharmacy  ');
    expect(second.name).toBe('Pharmacy');
    await setShoppingListSyncTarget(second.id, {
      provider: 'bring',
      remoteListId: 'remote',
      remoteListName: 'Remote',
    });
    const lists = await setShoppingListSyncTarget(second.id, null);

    expect(lists.find((entry) => entry.id === second.id)?.syncTarget).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    await createShoppingList('After unsubscribe');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('renames and deletes lists while preserving a valid active list', async () => {
    const second = await createShoppingList('Weekend');
    await selectActiveShoppingList(second.id);
    await addShoppingListItem(
      { barcode: 'manual:1', label: 'Tent', exactLabel: 'Tent', source: 'custom' },
      'Tent',
      undefined,
      second.id,
    );

    await renameShoppingList(second.id, ' Camping ');
    await expect(loadActiveShoppingList()).resolves.toMatchObject({
      id: second.id,
      name: 'Camping',
    });
    await deleteShoppingList(second.id);
    await expect(loadActiveShoppingList()).resolves.toMatchObject({ id: 'groceries' });
    await expect(loadShoppingList(second.id)).resolves.toEqual([]);
  });

  it('rejects invalid list updates and deleting the final list', async () => {
    await expect(renameShoppingList('groceries', ' ')).rejects.toThrow(
      'Shopping-list name is required.',
    );
    await expect(renameShoppingList('missing', 'Name')).rejects.toThrow('Unknown shopping list.');
    await expect(deleteShoppingList('missing')).rejects.toThrow('Unknown shopping list.');
    await expect(deleteShoppingList('groceries')).rejects.toThrow(
      'At least one shopping list is required.',
    );
  });

  it('creates, renames, and deletes stores', async () => {
    const stores = await createStore(' Migros ');
    expect(stores).toHaveLength(1);
    expect(stores[0]).toMatchObject({ name: 'Migros' });

    await expect(renameStore(stores[0].id, 'Coop')).resolves.toEqual([
      expect.objectContaining({ id: stores[0].id, name: 'Coop' }),
    ]);
    await expect(deleteStore(stores[0].id)).resolves.toEqual([]);
    await expect(loadStores()).resolves.toEqual([]);
    await expect(createStore(' ')).rejects.toThrow('Store name is required.');
    await expect(renameStore('missing', 'Name')).rejects.toThrow('Unknown store.');
    await expect(renameStore('missing', ' ')).rejects.toThrow('Store name is required.');
    await expect(deleteStore('missing')).rejects.toThrow('Unknown store.');
  });

  it('persists a shopping session and purchased-item timestamps', async () => {
    const store = (await createStore('Moon Market'))[0];
    const list = (await loadShoppingLists())[0];
    const item = {
      barcode: '7611111111111',
      label: 'Moon Milk',
      scannedAt: 1,
      remoteItemId: 'remote-milk',
      remoteSpecification: 'barcode:7611111111111',
    };
    const session = await createShoppingSession(store, list, 100);
    await expect(createShoppingSession(store, [], 99)).rejects.toThrow(
      'At least one shopping list is required.',
    );
    await expect(restoreShoppingPurchase(session.id, 'missing')).rejects.toThrow(
      'Unknown purchased item.',
    );

    const purchased = await recordShoppingPurchase(session.id, item, 200);
    expect(purchased.purchasedItems).toEqual([
      {
        ...item,
        purchasedAt: 200,
        sourceListId: list.id,
        sourceListName: list.name,
      },
    ]);
    const restored = await restoreShoppingPurchase(session.id, item.barcode);
    expect(restored.purchasedItems).toEqual([]);
    await expect(loadShoppingList(list.id)).resolves.toEqual([
      { barcode: item.barcode, label: item.label, scannedAt: item.scannedAt },
    ]);
    await recordShoppingPurchase(session.id, item, 250);
    await expect(deleteShoppingSession(session.id)).rejects.toThrow('Unknown completed shopping.');
    const completed = await completeShoppingSession(session.id, 300);
    expect(completed.completedAt).toBe(300);
    await expect(loadShoppingSessions()).resolves.toEqual([
      expect.objectContaining({ id: session.id, completedAt: 300 }),
    ]);
    await expect(recordShoppingPurchase(session.id, item, 400)).rejects.toThrow(
      'No active shopping found.',
    );
    await expect(completeShoppingSession('missing', 500)).rejects.toThrow('Unknown shopping.');
    await expect(restoreShoppingPurchase('missing', item.barcode)).rejects.toThrow(
      'No active shopping found.',
    );
    await expect(deleteShoppingSession('missing')).rejects.toThrow('Unknown completed shopping.');
    await expect(deleteShoppingSession(session.id)).resolves.toEqual([]);
    await expect(loadShoppingSessions()).resolves.toEqual([]);
  });

  it('restores duplicate barcodes to the selected source list in a multi-list session', async () => {
    const store = (await createStore('Shared Market'))[0];
    const groceries = (await loadShoppingLists())[0];
    const errands = await createShoppingList('Errands');
    const item = { barcode: 'manual:shared', label: 'Shared', scannedAt: 1 };
    const session = await createShoppingSession(store, [groceries, errands], 100);
    await recordShoppingPurchase(session.id, item, 200, groceries);
    await recordShoppingPurchase(session.id, item, 300, errands);

    const restored = await restoreShoppingPurchase(session.id, item.barcode, groceries.id);

    await expect(loadShoppingList(groceries.id)).resolves.toEqual([item]);
    await expect(loadShoppingList(errands.id)).resolves.toEqual([]);
    expect(restored.purchasedItems).toEqual([
      expect.objectContaining({ sourceListId: errands.id, purchasedAt: 300 }),
    ]);
    await expect(restoreShoppingPurchase(session.id, item.barcode, 'missing')).rejects.toThrow(
      'Unknown purchased item.',
    );
  });

  it('restores purchased items from legacy single-list sessions', async () => {
    const legacyItem = {
      barcode: 'manual:legacy',
      label: 'Legacy',
      scannedAt: 1,
      purchasedAt: 2,
    };
    await AsyncStorage.setItem(
      'shopping-sessions-v1',
      JSON.stringify([
        {
          id: 'legacy-session',
          storeId: 'store',
          storeName: 'Store',
          listId: 'groceries',
          listName: 'Groceries',
          startedAt: 1,
          purchasedItems: [legacyItem],
        },
      ]),
    );

    await restoreShoppingPurchase('legacy-session', legacyItem.barcode, 'groceries');

    await expect(loadShoppingList('groceries')).resolves.toEqual([
      { barcode: 'manual:legacy', label: 'Legacy', scannedAt: 1 },
    ]);
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

  it('stores Mealie configuration securely and enables it independently', async () => {
    const config = { baseUrl: 'https://mealie.example.test', token: 'secret-token' };
    await saveMealieConfig(config);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('mealie-config', JSON.stringify(config));
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify(config));
    await expect(loadMealieConfig()).resolves.toEqual(config);
    await saveMealieSyncEnabled(true);
    await expect(loadMealieSyncEnabled()).resolves.toBe(true);
    await clearMealieConfig();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('mealie-config');
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
