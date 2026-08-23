import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AuthProvider, useAuth } from '../../src/auth';
import { I18nProvider } from '../../src/i18n';
import { saveBringSyncEnabled, saveSelectedList } from '../../src/services/storage';

type AuthState = ReturnType<typeof useAuth>;
let auth: AuthState;

function Probe() {
  const value = useAuth();
  useEffect(() => {
    auth = value;
  }, [value]);
  return (
    <Text testID="auth-state">
      {JSON.stringify({
        initializing: value.initializing,
        credentials: value.credentials,
        lists: value.lists,
        selectedList: value.selectedList,
      })}
    </Text>
  );
}

function response(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

function renderAuth() {
  return render(
    <I18nProvider>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </I18nProvider>,
  );
}

async function waitUntilInitialized() {
  await waitFor(() => expect(auth.initializing).toBe(false));
}

beforeEach(async () => {
  process.env.EXPO_PUBLIC_BRING_API_KEY = 'test-only-key';
  await AsyncStorage.clear();
  jest.clearAllMocks();
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
});

afterEach(() => jest.restoreAllMocks());

describe('authentication state', () => {
  it('initializes as logged out and removes an orphaned cached list', async () => {
    await saveSelectedList({ listUuid: 'orphan', name: 'Old List' });

    await renderAuth();
    await waitUntilInitialized();

    expect(auth.credentials).toBeNull();
    expect(auth.selectedList).toBeNull();
    await waitFor(() => expect(AsyncStorage.removeItem).toHaveBeenCalledWith('selected-list'));
  });

  it('restores credentials and a selected list, then refreshes available lists', async () => {
    await saveBringSyncEnabled(true);
    const credentials = { email: 'pilot@moon.example', password: 'lunar-secret' };
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify(credentials));
    await saveSelectedList({ listUuid: 'selected', name: 'Stored Supplies' });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'moon-user', access_token: 'moon-token' }))
      .mockResolvedValueOnce(response({ lists: [{ listUuid: 'fresh', name: 'Fresh Supplies' }] }));

    await renderAuth();
    await waitUntilInitialized();

    expect(auth.credentials).toEqual(credentials);
    expect(auth.selectedList).toEqual({ listUuid: 'selected', name: 'Stored Supplies' });
    await waitFor(() =>
      expect(auth.lists).toEqual([{ listUuid: 'fresh', name: 'Fresh Supplies' }]),
    );
  });

  it('keeps restored authentication usable when refreshing lists fails', async () => {
    await saveBringSyncEnabled(true);
    const credentials = { email: 'pilot@moon.example', password: 'lunar-secret' };
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify(credentials));
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));

    await renderAuth();
    await waitUntilInitialized();

    expect(auth.credentials).toEqual(credentials);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(auth.lists).toEqual([]);
  });

  it('falls back to logged-out state if local authentication storage cannot be read', async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('keychain unavailable'));

    await act(async () => {
      renderAuth();
    });

    expect(auth.initializing).toBe(false);
    expect(auth.credentials).toBeNull();
    expect(auth.lists).toEqual([]);
    expect(auth.selectedList).toBeNull();
  });

  it('logs in with a trimmed email and clears a previously selected list', async () => {
    await saveSelectedList({ listUuid: 'old', name: 'Old Supplies' });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'moon-user', access_token: 'moon-token' }))
      .mockResolvedValueOnce(response({ lists: [{ listUuid: 'fresh', name: 'Fresh Supplies' }] }));
    await renderAuth();
    await waitUntilInitialized();

    await act(() => auth.login({ email: '  pilot@moon.example  ', password: 'lunar-secret' }));

    expect(auth.credentials).toEqual({
      email: 'pilot@moon.example',
      password: 'lunar-secret',
    });
    expect(auth.selectedList).toBeNull();
    expect(auth.lists).toEqual([{ listUuid: 'fresh', name: 'Fresh Supplies' }]);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'bring-credentials',
      JSON.stringify({ email: 'pilot@moon.example', password: 'lunar-secret' }),
    );
  });

  it('does not change authentication state when login fails', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    await renderAuth();
    await waitUntilInitialized();

    await expect(
      act(() => auth.login({ email: 'pilot@moon.example', password: 'wrong' })),
    ).rejects.toThrow('offline');
    expect(auth.credentials).toBeNull();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('persists list selection and clears all authentication state on logout', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ uuid: 'moon-user', access_token: 'moon-token' }))
      .mockResolvedValueOnce(response({ lists: [] }));
    await renderAuth();
    await waitUntilInitialized();
    await act(() => auth.login({ email: 'pilot@moon.example', password: 'lunar-secret' }));

    await act(() => auth.selectList({ listUuid: 'moon-list', name: 'Moon Supplies' }));
    expect(auth.selectedList).toEqual({ listUuid: 'moon-list', name: 'Moon Supplies' });

    await act(() => auth.logout());
    expect(auth.credentials).toBeNull();
    expect(auth.selectedList).toBeNull();
    expect(auth.lists).toEqual([]);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('bring-credentials');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('selected-list');
  });
});
