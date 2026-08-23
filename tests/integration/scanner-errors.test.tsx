import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ScannerScreen } from '../../src/screens/ScannerScreen';
import { saveSelectedList } from '../../src/services/storage';

jest.mock('expo-camera', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    CameraView: ({ onBarcodeScanned }: { onBarcodeScanned?: (result: object) => void }) =>
      React.createElement(
        Pressable,
        {
          accessibilityLabel: 'Test camera',
          onPress: () =>
            onBarcodeScanned?.({
              data: '7611111111111',
              type: 'ean13',
              bounds: { origin: { x: 135, y: 195 }, size: { width: 80, height: 40 } },
              cornerPoints: [],
            }),
        },
        React.createElement(Text, null, 'Camera preview'),
      ),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});

jest.mock('@react-navigation/native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(callback, [callback]),
  };
});

function apiResponse(options: { ok: boolean; status: number; body?: unknown }) {
  return {
    ok: options.ok,
    status: options.status,
    json: async () => options.body ?? {},
  } as Response;
}

async function renderConfiguredScanner() {
  jest
    .mocked(SecureStore.getItemAsync)
    .mockResolvedValue(JSON.stringify({ email: 'pilot@moon.example', password: 'lunar-secret' }));
  await saveSelectedList({ listUuid: 'weekend-list', name: 'Weekend Supplies' });
  return render(<ScannerScreen />);
}

async function scanBarcode(screen: Awaited<ReturnType<typeof render>>) {
  const openScanner = screen.queryByTestId('open-scanner');
  if (openScanner) await fireEvent.press(openScanner);
  await fireEvent.press(screen.getByLabelText('Test camera'));
  await act(async () => {
    jest.advanceTimersByTime(650);
    await Promise.resolve();
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('scanner lookup failures', () => {
  it.each([
    ['404 response', apiResponse({ ok: false, status: 404 })],
    ['response without a product', apiResponse({ ok: true, status: 200, body: {} })],
    [
      'product without a usable name',
      apiResponse({ ok: true, status: 200, body: { product: { brands: 'Nameless' } } }),
    ],
  ])('shows a not-found message for a %s', async (_case, result) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(result);
    const screen = await renderConfiguredScanner();

    await scanBarcode(screen);

    expect(
      await screen.findByText(
        'Product not found. Add a custom label in Settings and scan again.',
        undefined,
        { timeout: 2000 },
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Test camera')).toBeEnabled();
  });

  it.each([
    ['database HTTP error', () => Promise.resolve(apiResponse({ ok: false, status: 503 }))],
    ['database network error', () => Promise.reject(new Error('offline'))],
    [
      'database JSON error',
      () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => Promise.reject(new SyntaxError('bad JSON')),
        } as unknown as Response),
    ],
  ])('shows a lookup error for a %s', async (_name, response) => {
    jest.spyOn(global, 'fetch').mockImplementationOnce(response);
    const screen = await renderConfiguredScanner();

    await scanBarcode(screen);

    expect(
      await screen.findByText('Product lookup failed.', undefined, { timeout: 2000 }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Test camera')).toBeEnabled();
  });
});
