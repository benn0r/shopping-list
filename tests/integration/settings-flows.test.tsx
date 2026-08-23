import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Alert, Linking } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AuthProvider, LoginModal } from '../../src/auth';
import { I18nProvider } from '../../src/i18n';
import { SettingsScreen } from '../../src/screens/SettingsScreen';
import {
  loadAppLanguage,
  loadCustomBarcodes,
  loadLookupPreferences,
  loadSelectedList,
  saveBringSyncEnabled,
  saveSelectedList,
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
        <LoginModal />
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
  it('requires login, signs in to Bring, selects a list, and logs out', async () => {
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

    await waitFor(() => expect(screen.getByText('Sign In to Bring')).toBeTruthy());
    expect(screen.getByTestId('login-sheet')).toHaveStyle({
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
    });
    await fireEvent(screen.getByTestId('login-modal'), 'requestClose');
    expect(screen.getByText('Sign In to Bring')).toBeTruthy();

    await fireEvent.changeText(
      screen.getByPlaceholderText('you@example.com'),
      'pilot@moon.example',
    );
    await fireEvent.changeText(screen.getByPlaceholderText('Required'), 'lunar-secret');
    await fireEvent.press(screen.getByText('Sign In'));

    await waitFor(() => expect(screen.getByText('Weekend Supplies')).toBeTruthy());
    expect(screen.getByText('pilot@moon.example')).toBeTruthy();
    expect(screen.queryByPlaceholderText('you@example.com')).toBeNull();
    expect(screen.queryByPlaceholderText('Required')).toBeNull();
    expect(String((fetchSpy.mock.calls[0][1] as RequestInit).body)).toContain(
      'email=pilot%40moon.example',
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'bring-credentials',
      JSON.stringify({ email: 'pilot@moon.example', password: 'lunar-secret' }),
    );

    await fireEvent.press(screen.getByText('Weekend Supplies'));

    await expect(loadSelectedList()).resolves.toEqual({
      listUuid: 'weekend-list',
      name: 'Weekend Supplies',
    });
    expect(screen.getByTestId('list-weekend-list').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByText('Weekend Supplies selected.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Log Out'));

    await waitFor(() => expect(screen.getByText('Sign In to Bring')).toBeTruthy());
    await expect(loadSelectedList()).resolves.toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('bring-credentials');
  });

  it('keeps the required login modal open after invalid credentials', async () => {
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

    await waitFor(() => expect(screen.getByText('Sign In to Bring')).toBeTruthy());
    await fireEvent.changeText(
      screen.getByPlaceholderText('you@example.com'),
      'pilot@moon.example',
    );
    await fireEvent.changeText(screen.getByPlaceholderText('Required'), 'wrong-secret');
    await fireEvent.press(screen.getByText('Sign In'));

    expect(
      await screen.findByText('Could not connect to Bring. Check your credentials and try again.'),
    ).toBeTruthy();
    expect(screen.getByText('Sign In to Bring')).toBeTruthy();
  });

  it.each([
    ['server error', () => Promise.resolve(jsonResponse({}, { ok: false, status: 503 }))],
    ['network error', () => Promise.reject(new Error('offline'))],
  ])('keeps the required login modal open after a %s', async (_case, result) => {
    jest.spyOn(global, 'fetch').mockImplementationOnce(result);
    const screen = await renderAuthenticatedApp();
    await waitFor(() => expect(screen.getByText('Sign In to Bring')).toBeTruthy());
    await fireEvent.changeText(
      screen.getByPlaceholderText('you@example.com'),
      'pilot@moon.example',
    );
    await fireEvent.changeText(screen.getByPlaceholderText('Required'), 'lunar-secret');

    await fireEvent.press(screen.getByText('Sign In'));

    expect(
      await screen.findByText('Could not connect to Bring. Check your credentials and try again.'),
    ).toBeTruthy();
    expect(screen.getByText('Sign In to Bring')).toBeTruthy();
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

    expect(await screen.findByText('Cached Supplies')).toBeTruthy();
    expect(await screen.findByText('Fresh Supplies')).toBeTruthy();
    expect(screen.getByTestId('list-cached-list').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.queryByText('Sign In to Bring')).toBeNull();
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

  it('supports every product-language setting and confirms each save', async () => {
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
      expect(screen.getByText(`Product language set to ${title}.`)).toBeTruthy();
    }
  });

  it('selects the Bring item label style', async () => {
    const screen = await renderSettings();

    await fireEvent.press(screen.getByText('Exact Product'));

    await expect(loadLookupPreferences()).resolves.toEqual({
      language: 'auto',
      labelStyle: 'exact',
    });
  });

  it('supports every Bring label style and confirms each save', async () => {
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
      expect(screen.getByText(`Bring item label set to ${title}.`)).toBeTruthy();
    }
  });

  it('adds and removes a custom barcode', async () => {
    const screen = await renderSettings();
    await fireEvent.press(screen.getByText('Custom Barcodes'));
    await fireEvent.changeText(screen.getByPlaceholderText('7612345678901'), '7611111111111');
    await fireEvent.changeText(screen.getByPlaceholderText('Product name'), 'Moon Crackers');
    await fireEvent.press(screen.getByText('Save Custom Barcode'));

    await waitFor(() => expect(screen.getByText('Moon Crackers')).toBeTruthy());
    expect(screen.getByText('Custom barcode saved.')).toBeTruthy();
    expect(screen.getByPlaceholderText('7612345678901').props.value).toBe('');
    expect(screen.getByPlaceholderText('Product name').props.value).toBe('');
    await expect(loadCustomBarcodes()).resolves.toEqual([
      { barcode: '7611111111111', label: 'Moon Crackers' },
    ]);

    let confirmRemoval: (() => void) | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      confirmRemoval = buttons?.find((button) => button.style === 'destructive')?.onPress;
    });
    await fireEvent.press(screen.getByText('Delete'));
    expect(confirmRemoval).toBeDefined();
    await act(async () => confirmRemoval?.());

    await waitFor(() => expect(screen.queryByText('Moon Crackers')).toBeNull());
    await expect(loadCustomBarcodes()).resolves.toEqual([]);
    expect(screen.getByText('Custom barcode removed.')).toBeTruthy();
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
    await fireEvent.press(screen.getByText('Delete'));
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
        'This companion is not affiliated with Bring! Labs AG. Product data © Open Food Facts contributors (ODbL).',
      ),
    ).toBeTruthy();
  });

  it('anchors confirmation over content and removes it after three seconds', async () => {
    jest.useFakeTimers();
    const screen = await renderSettings();

    await fireEvent.press(screen.getByTestId('product-language-de'));
    await waitFor(() => expect(screen.getByText('Product language set to German.')).toBeTruthy());
    expect(screen.getByText('Product language set to German.').parent).toHaveStyle({
      position: 'absolute',
      bottom: 12,
    });

    await act(async () => jest.advanceTimersByTime(3000));
    expect(screen.queryByText('Product language set to German.')).toBeNull();
  });
});
