import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Alert, Linking } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AuthProvider } from '../../src/auth';
import { I18nProvider } from '../../src/i18n';
import { SettingsScreen } from '../../src/screens/SettingsScreen';
import {
  loadAppLanguage,
  loadBringSyncEnabled,
  loadCustomBarcodes,
  loadLookupPreferences,
  loadListViewMode,
  loadMealieSyncEnabled,
  loadSelectedList,
  loadShoppingLists,
  loadStores,
  saveBringSyncEnabled,
  saveSelectedList,
  setShoppingListSyncTarget,
} from '../../src/services/storage';
import { PRODUCT_DATABASES } from '../../src/productDatabases';

function jsonResponse(body: unknown, options: { ok?: boolean; status?: number } = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => body,
  } as Response;
}

async function renderSettings() {
  return render(
    <I18nProvider>
      <SettingsScreen />
    </I18nProvider>,
  );
}

async function renderAuthenticatedApp() {
  return render(
    <I18nProvider>
      <AuthProvider>
        <SettingsScreen />
      </AuthProvider>
    </I18nProvider>,
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await saveBringSyncEnabled(true);
  jest.clearAllMocks();
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('settings flows', () => {
  it('hides inline Bring settings when sync is disabled', async () => {
    const screen = await renderAuthenticatedApp();

    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());
    await fireEvent(screen.getByTestId('bring-sync-switch'), 'valueChange', false);

    await waitFor(() => expect(screen.queryByLabelText('Email')).toBeNull());
    await expect(loadBringSyncEnabled()).resolves.toBe(false);
    expect(screen.getByTestId('bring-sync-switch').props.value).toBe(false);
  });

  it('validates empty inline Bring credentials without contacting the provider', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const screen = await renderAuthenticatedApp();
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());

    await fireEvent.press(screen.getByRole('button', { name: 'Connect Bring' }));

    expect(await screen.findByText('Enter your Bring email and password.')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('connects Mealie alongside Bring and maps one local list to a Mealie list', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        jsonResponse({ items: [{ id: 'mealie-groceries', name: 'Household Groceries' }] }),
      );
    const screen = await renderSettings();

    await fireEvent(screen.getByTestId('mealie-sync-switch'), 'valueChange', true);
    await fireEvent.changeText(
      screen.getByLabelText('Mealie server URL'),
      'https://mealie.example.test/',
    );
    await fireEvent.changeText(screen.getByLabelText('API token'), 'meal-token');
    await fireEvent.press(screen.getByRole('button', { name: 'Connect Mealie' }));

    await waitFor(() => expect(loadMealieSyncEnabled()).resolves.toBe(true));
    expect(screen.queryByText('Mealie connected.')).toBeNull();
    await expect(loadMealieSyncEnabled()).resolves.toBe(true);
    await expect(loadBringSyncEnabled()).resolves.toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://mealie.example.test/api/households/shopping/lists?perPage=-1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer meal-token' }),
      }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Disconnect Mealie' }));
    await expect(loadMealieSyncEnabled()).resolves.toBe(false);
    expect(screen.getByTestId('mealie-sync-switch').props.value).toBe(false);

    await fireEvent(screen.getByTestId('mealie-sync-switch'), 'valueChange', true);
    await fireEvent.changeText(
      screen.getByLabelText('Mealie server URL'),
      'https://mealie.example.test/',
    );
    await fireEvent.changeText(screen.getByLabelText('API token'), 'meal-token');
    await fireEvent.press(screen.getByRole('button', { name: 'Connect Mealie' }));
    await waitFor(() => expect(loadMealieSyncEnabled()).resolves.toBe(true));

    await fireEvent(screen.getByTestId('mealie-sync-switch'), 'valueChange', false);
    await expect(loadMealieSyncEnabled()).resolves.toBe(false);
    await fireEvent(screen.getByTestId('mealie-sync-switch'), 'valueChange', true);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));

    await fireEvent.press(screen.getByTestId('edit-list-groceries'));
    await fireEvent.press(screen.getByTestId('list-editor-sync-mealie-mealie-groceries'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await expect(loadShoppingLists()).resolves.toEqual([
      expect.objectContaining({
        id: 'groceries',
        syncTarget: {
          provider: 'mealie',
          remoteListId: 'mealie-groceries',
          remoteListName: 'Household Groceries',
        },
      }),
    ]);
  });

  it('rejects invalid Mealie connection settings', async () => {
    const screen = await renderSettings();
    await fireEvent(screen.getByTestId('mealie-sync-switch'), 'valueChange', true);
    await fireEvent.changeText(screen.getByLabelText('Mealie server URL'), 'file:///private');
    await fireEvent.changeText(screen.getByLabelText('API token'), 'token');
    await fireEvent.press(screen.getByRole('button', { name: 'Connect Mealie' }));
    expect(
      await screen.findByText('Could not connect to Mealie. Check the URL and API token.'),
    ).toBeTruthy();
  });

  it('restores a previously enabled Mealie connection on launch', async () => {
    await AsyncStorage.setItem('mealie-sync-enabled', 'true');
    jest
      .mocked(SecureStore.getItemAsync)
      .mockResolvedValueOnce(
        JSON.stringify({ baseUrl: 'https://mealie.example.test', token: 'stored-token' }),
      );
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse({ items: [{ id: 'stored-list', name: 'Stored List' }] }));
    const screen = await renderSettings();
    await waitFor(() => expect(screen.getByTestId('mealie-sync-switch').props.value).toBe(true));
    await fireEvent.press(screen.getByTestId('edit-list-groceries'));
    expect(await screen.findByTestId('list-editor-sync-mealie-stored-list')).toBeTruthy();
    await fireEvent(screen.getByTestId('list-editor-modal'), 'requestClose');
  });

  it('connects Bring inline, selects a list, and disconnects', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ uuid: 'moon-user', access_token: 'moon-token' }))
      .mockResolvedValueOnce(
        jsonResponse({
          lists: [
            { listUuid: 'weekend-list', name: 'Weekend Supplies' },
            { listUuid: 'station-list', name: 'Space Station Pantry' },
          ],
        }),
      );
    const screen = await renderAuthenticatedApp();

    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Email'), 'pilot@moon.example');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'lunar-secret');
    await fireEvent.press(screen.getByText('Connect Bring'));

    await waitFor(() => expect(screen.getByText('Disconnect Bring')).toBeTruthy());
    expect(screen.getByLabelText('Email').props.value).toBe('pilot@moon.example');
    expect(String((fetchSpy.mock.calls[0][1] as RequestInit).body)).toContain(
      'email=pilot%40moon.example',
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'bring-credentials',
      JSON.stringify({ email: 'pilot@moon.example', password: 'lunar-secret' }),
    );

    await fireEvent.press(screen.getByTestId('edit-list-groceries'));
    await fireEvent.press(screen.getByTestId('list-editor-sync-weekend-list'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await expect(loadShoppingLists()).resolves.toEqual([
      expect.objectContaining({
        id: 'groceries',
        syncTarget: {
          provider: 'bring',
          remoteListId: 'weekend-list',
          remoteListName: 'Weekend Supplies',
        },
      }),
    ]);
    expect(screen.getByTestId('list-editor-groceries')).toBeTruthy();

    await fireEvent.press(screen.getByText('Disconnect Bring'));

    await waitFor(() => expect(screen.queryByLabelText('Email')).toBeNull());
    await expect(loadSelectedList()).resolves.toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('bring-credentials');
  });

  it('keeps inline Bring settings available after invalid credentials', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse(
        { message: 'Invalid credentials' },
        {
          ok: false,
          status: 401,
        },
      ),
    );
    const screen = await renderAuthenticatedApp();

    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Email'), 'pilot@moon.example');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong-secret');
    await fireEvent.press(screen.getByText('Connect Bring'));

    expect(
      await screen.findByText('Could not connect to Bring. Check your credentials and try again.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });

  it.each([
    ['server error', () => Promise.resolve(jsonResponse({}, { ok: false, status: 503 }))],
    ['network error', () => Promise.reject(new Error('offline'))],
  ])('keeps inline Bring settings available after a %s', async (_case, result) => {
    jest.spyOn(global, 'fetch').mockImplementationOnce(result);
    const screen = await renderAuthenticatedApp();
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Email'), 'pilot@moon.example');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'lunar-secret');

    await fireEvent.press(screen.getByText('Connect Bring'));

    expect(
      await screen.findByText('Could not connect to Bring. Check your credentials and try again.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });

  it('restores a cached selected list even when it is absent from the refreshed lists', async () => {
    jest
      .mocked(SecureStore.getItemAsync)
      .mockResolvedValue(JSON.stringify({ email: 'pilot@moon.example', password: 'lunar-secret' }));
    await saveSelectedList({ listUuid: 'cached-list', name: 'Cached Supplies' });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ uuid: 'moon-user', access_token: 'moon-token' }))
      .mockResolvedValueOnce(
        jsonResponse({ lists: [{ listUuid: 'fresh-list', name: 'Fresh Supplies' }] }),
      );

    const screen = await renderAuthenticatedApp();

    expect(await screen.findByText('Bring · Cached Supplies')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('edit-list-groceries'));
    expect(await screen.findByText('Fresh Supplies')).toBeTruthy();
    expect(screen.getByTestId('list-editor-sync-fresh-list').props.accessibilityState).toEqual({
      selected: false,
    });
    expect(screen.getByText('Disconnect Bring')).toBeTruthy();
  });

  it('creates, renames, and deletes local shopping lists in Settings', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await renderSettings();

    await fireEvent.press(await screen.findByRole('button', { name: 'Add List' }));
    expect(screen.getByTestId('list-editor-sheet')).toHaveStyle({
      height: '88%',
      minHeight: '72%',
    });
    await fireEvent.changeText(screen.getByLabelText('List name'), 'Weekend');
    await fireEvent.press(screen.getByRole('button', { name: 'Create List' }));
    const created = (await loadShoppingLists()).find((list) => list.name === 'Weekend')!;
    expect(created).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`edit-list-${created.id}`));
    await fireEvent.changeText(screen.getByLabelText('List name'), 'Errands');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await expect(loadShoppingLists()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id, name: 'Errands' })]),
    );

    await fireEvent.press(screen.getByTestId(`edit-list-${created.id}`));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete List' }));
    const destructive = alert.mock.calls[0][2]?.find((button) => button.style === 'destructive');
    await act(async () => destructive?.onPress?.());
    await expect(loadShoppingLists()).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );
  });

  it('cancels list editing and can remove its single provider mapping', async () => {
    await setShoppingListSyncTarget('groceries', {
      provider: 'mealie',
      remoteListId: 'old-list',
      remoteListName: 'Old Mealie List',
    });
    const screen = await renderSettings();
    await fireEvent.press(await screen.findByTestId('edit-list-groceries'));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('list-editor-sync-none')).toBeNull();

    await fireEvent.press(screen.getByTestId('edit-list-groceries'));
    await fireEvent.press(screen.getByTestId('list-editor-sync-none'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    const [unmapped] = await loadShoppingLists();
    expect(unmapped).toMatchObject({ id: 'groceries', name: 'Groceries' });
    expect(unmapped).not.toHaveProperty('syncTarget');
  });

  it('keeps the final shopping list and shows an error', async () => {
    const screen = await renderSettings();

    await fireEvent.press(await screen.findByTestId('edit-list-groceries'));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete List' }));

    expect(screen.getByText('At least one shopping list is required.')).toBeTruthy();
    await expect(loadShoppingLists()).resolves.toHaveLength(1);
  });

  it('creates, renames, and deletes stores in a drawer', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await renderSettings();

    await fireEvent.press(await screen.findByRole('button', { name: 'Add Store' }));
    expect(screen.getByTestId('store-editor-sheet')).toHaveStyle({
      height: '72%',
      minHeight: '72%',
    });
    expect(screen.getByText('Store name').props).toMatchObject({
      numberOfLines: 1,
      adjustsFontSizeToFit: true,
    });
    await fireEvent.changeText(screen.getByLabelText('Store name'), 'Migros');
    await fireEvent.press(screen.getByRole('button', { name: 'Create Store' }));
    const created = (await loadStores())[0];
    expect(created.name).toBe('Migros');

    await fireEvent.press(screen.getByTestId(`edit-store-${created.id}`));
    await fireEvent.changeText(screen.getByLabelText('Store name'), 'Coop');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await expect(loadStores()).resolves.toEqual([expect.objectContaining({ name: 'Coop' })]);

    await fireEvent.press(screen.getByTestId(`edit-store-${created.id}`));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete Store' }));
    const destructive = alert.mock.calls[0][2]?.find((button) => button.style === 'destructive');
    await act(async () => destructive?.onPress?.());
    await expect(loadStores()).resolves.toEqual([]);
  });

  it('changes the app language', async () => {
    const screen = await renderSettings();

    await fireEvent.press(screen.getByText('Deutsch'));

    await waitFor(() => expect(screen.getByText('Einstellungen')).toBeTruthy());
    await expect(loadAppLanguage()).resolves.toBe('de');
  });

  it.each([
    ['en', 'English'],
    ['de', 'Deutsch'],
    ['fr', 'Français'],
    ['it', 'Italiano'],
    ['pt', 'Português'],
    ['pt-BR', 'Português (Brasil)'],
  ] as const)('selects and persists the %s app language', async (language, name) => {
    const screen = await renderSettings();

    await fireEvent.press(screen.getByTestId(`app-language-${language}`));

    await expect(loadAppLanguage()).resolves.toBe(language);
    expect(screen.getByTestId(`app-language-${language}`).props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getAllByText(name).length).toBeGreaterThan(0);
  });

  it('changes the product language', async () => {
    const screen = await renderSettings();

    await fireEvent.press(screen.getByText('German'));

    await expect(loadLookupPreferences()).resolves.toEqual({
      language: 'de',
      labelStyle: 'generic',
    });
  });

  it('selects and persists the shopping-list view', async () => {
    const screen = await renderSettings();

    await fireEvent.press(screen.getByTestId('list-view-tiles'));
    await expect(loadListViewMode()).resolves.toBe('tiles');
    expect(screen.getByTestId('list-view-tiles').props.accessibilityState).toEqual({
      selected: true,
    });

    await fireEvent.press(screen.getByTestId('list-view-list'));
    await expect(loadListViewMode()).resolves.toBe('list');
    expect(screen.getByTestId('list-view-list').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('supports every product-language setting without confirmation popups', async () => {
    const screen = await renderSettings();
    const options = [
      ['auto', 'Automatic'],
      ['de', 'German'],
      ['en', 'English'],
      ['fr', 'French'],
      ['it', 'Italian'],
    ] as const;

    for (const [language, title] of options) {
      await fireEvent.press(screen.getByTestId(`product-language-${language}`));
      await expect(loadLookupPreferences()).resolves.toMatchObject({ language });
      expect(screen.getByTestId(`product-language-${language}`).props.accessibilityState).toEqual({
        selected: true,
      });
      expect(screen.queryByText(`Product language set to ${title}.`)).toBeNull();
    }
  });

  it('selects the synced item label style', async () => {
    const screen = await renderSettings();

    await fireEvent.press(screen.getByText('Exact Product'));

    await expect(loadLookupPreferences()).resolves.toEqual({
      language: 'auto',
      labelStyle: 'exact',
    });
  });

  it('supports every synced label style and confirms each save', async () => {
    const screen = await renderSettings();
    const options = [
      ['generic', 'Generic'],
      ['exact', 'Exact Product'],
      ['ask', 'Ask Every Time'],
    ] as const;

    for (const [style, title] of options) {
      await fireEvent.press(screen.getByTestId(`label-style-${style}`));
      await expect(loadLookupPreferences()).resolves.toMatchObject({ labelStyle: style });
      expect(screen.getByTestId(`label-style-${style}`).props.accessibilityState).toEqual({
        selected: true,
      });
      expect(screen.queryByText(`Synced item label set to ${title}.`)).toBeNull();
    }
  });

  it('adds and removes a custom barcode', async () => {
    const screen = await renderSettings();
    await fireEvent.press(screen.getByText('Custom Barcodes'));
    await fireEvent.changeText(screen.getByPlaceholderText('7612345678901'), '7611111111111');
    await fireEvent.changeText(screen.getByPlaceholderText('Product name'), 'Moon Crackers');
    await fireEvent.press(screen.getByText('Save Custom Barcode'));

    await waitFor(() => expect(screen.getByText('Moon Crackers')).toBeTruthy());
    expect(screen.queryByText('Custom barcode saved.')).toBeNull();
    expect(screen.getByPlaceholderText('7612345678901').props.value).toBe('');
    expect(screen.getByPlaceholderText('Product name').props.value).toBe('');
    await expect(loadCustomBarcodes()).resolves.toEqual([
      { barcode: '7611111111111', label: 'Moon Crackers' },
    ]);

    let confirmRemoval: (() => void) | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      confirmRemoval = buttons?.find((button) => button.style === 'destructive')?.onPress;
    });
    await fireEvent.press(screen.getByTestId('delete-custom-7611111111111'));
    expect(confirmRemoval).toBeDefined();
    await act(async () => confirmRemoval?.());

    await waitFor(() => expect(screen.queryByText('Moon Crackers')).toBeNull());
    await expect(loadCustomBarcodes()).resolves.toEqual([]);
    expect(screen.queryByText('Custom barcode removed.')).toBeNull();
  });

  it.each([
    ['', 'Moon Milk'],
    ['1234567', 'Moon Milk'],
    ['123456789012345', 'Moon Milk'],
    ['7611111111111', '   '],
  ])('rejects invalid custom barcode input %#', async (barcode, label) => {
    const screen = await renderSettings();
    await fireEvent.press(screen.getByText('Custom Barcodes'));
    if (barcode) await fireEvent.changeText(screen.getByPlaceholderText('7612345678901'), barcode);
    if (label) await fireEvent.changeText(screen.getByPlaceholderText('Product name'), label);

    await fireEvent.press(screen.getByText('Save Custom Barcode'));

    expect(screen.getByText('Enter an 8–14 digit barcode and a label.')).toBeTruthy();
    await expect(loadCustomBarcodes()).resolves.toEqual([]);
  });

  it('normalizes a custom barcode, replaces duplicates, and preserves it when deletion is canceled', async () => {
    const screen = await renderSettings();
    await fireEvent.press(screen.getByText('Custom Barcodes'));
    await fireEvent.changeText(screen.getByPlaceholderText('7612345678901'), '7611 1111-11111');
    await fireEvent.changeText(screen.getByPlaceholderText('Product name'), '  Moon Milk  ');
    await fireEvent.press(screen.getByText('Save Custom Barcode'));

    await fireEvent.changeText(screen.getByPlaceholderText('7612345678901'), '7611111111111');
    await fireEvent.changeText(screen.getByPlaceholderText('Product name'), 'Comet Milk');
    await fireEvent.press(screen.getByText('Save Custom Barcode'));

    await expect(loadCustomBarcodes()).resolves.toEqual([
      { barcode: '7611111111111', label: 'Comet Milk' },
    ]);
    expect(screen.queryByText('Moon Milk')).toBeNull();
    expect(screen.getByText('Comet Milk')).toBeTruthy();

    let cancelRemoval: (() => void) | undefined;
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      expect(title).toBe('Remove Custom Barcode?');
      expect(message).toBe('The online lookup will be used the next time this barcode is scanned.');
      cancelRemoval = buttons?.find((button) => button.style === 'cancel')?.onPress;
    });
    await fireEvent.press(screen.getByTestId('delete-custom-7611111111111'));
    await act(async () => cancelRemoval?.());

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Comet Milk')).toBeTruthy();
    await expect(loadCustomBarcodes()).resolves.toHaveLength(1);
  });

  it('opens every product database and renders its description and disclaimer', async () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const screen = await renderSettings();

    for (const database of PRODUCT_DATABASES) {
      await fireEvent.press(screen.getByText(database.name));
      expect(openSpy).toHaveBeenLastCalledWith(database.url);
    }
    expect(screen.getByText('Food and drinks: ingredients, nutrition and allergens')).toBeTruthy();
    expect(
      screen.getByText(
        'Shopping List is not affiliated with Bring! Labs AG or the Mealie project. Product data © Open Food Facts contributors (ODbL).',
      ),
    ).toBeTruthy();
  });

  it('discloses that sync-provider integrations are independent', async () => {
    const screen = await renderSettings();

    expect(
      screen.getByText(/Shopping List is independent and is not affiliated with Bring!/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Shopping List is independent and is not affiliated with the Mealie project/,
      ),
    ).toBeTruthy();
  });

  it('does not show a confirmation popup after changing a preference', async () => {
    const screen = await renderSettings();

    await fireEvent.press(screen.getByTestId('product-language-de'));
    expect(screen.queryByText('Product language set to German.')).toBeNull();
  });
});
