import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  getComposerKeyboardInset,
  ProductSheet,
  ScannerScreen,
} from '../../src/screens/ScannerScreen';
import { addItem } from '../../src/services/bringApi';
import { lookupProduct } from '../../src/services/productLookup';
import {
  getListSyncState,
  removeFromSyncedList,
  syncShoppingList,
} from '../../src/services/shoppingListSync';
import {
  loadCredentials,
  addShoppingListItem,
  loadBringSyncEnabled,
  loadCustomBarcodes,
  loadLookupPreferences,
  loadListViewMode,
  loadActiveShoppingList,
  loadShoppingLists,
  loadShoppingList,
  loadSelectedList,
  removeShoppingListItem,
} from '../../src/services/storage';
import type { Product } from '../../src/types';

const mockRequestPermission = jest.fn();
const mockUseCameraPermissions = jest.fn();

jest.mock('expo-camera', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    CameraView: ({
      active,
      onBarcodeScanned,
    }: {
      active: boolean;
      onBarcodeScanned?: (result: object) => void;
    }) => {
      const props: import('react-native').ViewProps & {
        cameraActive: boolean;
        onBarcodeScanned?: (result: object) => void;
      } = {
        testID: 'camera-view',
        cameraActive: active,
        onBarcodeScanned,
      };
      return React.createElement(View, props);
    },
    useCameraPermissions: () => mockUseCameraPermissions(),
  };
});

jest.mock('@react-navigation/native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(callback, [callback]),
  };
});

jest.mock('../../src/services/bringApi', () => ({
  addItem: jest.fn(),
  loadItems: jest.fn().mockResolvedValue([]),
  removeItem: jest.fn(),
}));
jest.mock('../../src/services/shoppingListSync', () => ({
  getListSyncState: jest.fn(),
  removeFromSyncedList: jest.fn(),
  syncShoppingList: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../src/services/productLookup', () => ({ lookupProduct: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  loadCredentials: jest.fn(),
  addShoppingListItem: jest.fn(),
  loadBringSyncEnabled: jest.fn(),
  loadCustomBarcodes: jest.fn(),
  loadLookupPreferences: jest.fn(),
  loadListViewMode: jest.fn(),
  loadActiveShoppingList: jest.fn(),
  loadShoppingLists: jest.fn(),
  selectActiveShoppingList: jest.fn(),
  loadShoppingList: jest.fn(),
  loadSelectedList: jest.fn(),
  removeShoppingListItem: jest.fn(),
}));

const credentials = { email: 'pilot@moon.example', password: 'lunar-secret' };
const list = { listUuid: 'weekend-list', name: 'Weekend Supplies' };
const cola: Product = {
  barcode: '7611111111111',
  label: 'Soft drink',
  exactLabel: 'Comet Cola, 330ml',
  genericLabel: 'Soft drink',
  brand: 'Comet',
  imageUrl: 'https://images.example/cola.png',
  source: 'open-products-family',
  productType: 'food',
};

type ScanResult = {
  data: string;
  type: string;
  bounds?: { origin: { x: number; y: number }; size: { width: number; height: number } };
  cornerPoints?: { x: number; y: number }[];
};

const scan = (data = cola.barcode, x = 175, y = 215): ScanResult => ({
  data,
  type: 'ean13',
  bounds: { origin: { x: x - 30, y: y - 15 }, size: { width: 60, height: 30 } },
  cornerPoints: [],
});

async function emitScan(screen: Awaited<ReturnType<typeof render>>, result: ScanResult = scan()) {
  if (!screen.queryByTestId('camera-view')) {
    await fireEvent.press(await screen.findByTestId('open-scanner'));
  }
  await fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', result);
  await act(async () => {
    jest.advanceTimersByTime(650);
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockUseCameraPermissions.mockReturnValue([{ granted: true }, mockRequestPermission]);
  jest.mocked(loadCredentials).mockResolvedValue(credentials);
  jest.mocked(loadBringSyncEnabled).mockResolvedValue(true);
  jest.mocked(loadSelectedList).mockResolvedValue(list);
  jest.mocked(loadCustomBarcodes).mockResolvedValue([]);
  jest.mocked(loadLookupPreferences).mockResolvedValue({ language: 'auto', labelStyle: 'generic' });
  jest.mocked(loadListViewMode).mockResolvedValue('list');
  jest.mocked(loadActiveShoppingList).mockResolvedValue({
    id: 'groceries',
    name: 'Groceries',
    syncTarget: {
      provider: 'bring',
      remoteListId: list.listUuid,
      remoteListName: list.name,
    },
  });
  jest.mocked(loadShoppingLists).mockResolvedValue([
    {
      id: 'groceries',
      name: 'Groceries',
      syncTarget: {
        provider: 'bring',
        remoteListId: list.listUuid,
        remoteListName: list.name,
      },
    },
  ]);
  jest.mocked(loadShoppingList).mockResolvedValue([]);
  jest.mocked(getListSyncState).mockImplementation(async (localList) => {
    const enabled = await loadBringSyncEnabled();
    return {
      enabled,
      configured: Boolean(enabled && (await loadCredentials()) && localList.syncTarget),
    };
  });
  jest.mocked(syncShoppingList).mockResolvedValue([]);
  jest
    .mocked(addShoppingListItem)
    .mockResolvedValue([
      { barcode: cola.barcode, label: cola.exactLabel, brand: cola.brand, scannedAt: 1 },
    ]);
  jest.mocked(lookupProduct).mockResolvedValue(cola);
  jest.mocked(addItem).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('scanner setup and selection', () => {
  it('positions the floating composer above the iPhone keyboard and tab bar', () => {
    expect(getComposerKeyboardInset(336)).toBe(336);
    expect(getComposerKeyboardInset(0)).toBe(0);
  });

  it('shows Mealie quantity and unit in list cards and item details', async () => {
    const mealieItem = {
      barcode: 'remote:mealie-milk',
      label: 'Milk',
      quantity: 2,
      unit: 'cartons',
      scannedAt: 1,
      remoteItemId: 'mealie-milk',
    };
    jest.mocked(loadShoppingList).mockResolvedValue([mealieItem]);
    jest.mocked(syncShoppingList).mockResolvedValue([mealieItem]);
    const screen = await render(<ScannerScreen />);

    expect(await screen.findByText('2 cartons Milk')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('shopping-item-remote:mealie-milk'));
    expect(screen.getByText('2 cartons')).toBeTruthy();
  }, 15_000);

  it('renders a safe empty state while camera permission is loading', async () => {
    mockUseCameraPermissions.mockReturnValue([null, mockRequestPermission]);
    const screen = await render(<ScannerScreen />);

    expect(screen.queryByText('Scan')).toBeNull();
    expect(screen.queryByTestId('camera-view')).toBeNull();
  });

  it('requests camera access when permission is denied', async () => {
    jest.mocked(loadBringSyncEnabled).mockResolvedValue(false);
    mockUseCameraPermissions.mockReturnValue([{ granted: false }, mockRequestPermission]);
    const screen = await render(<ScannerScreen />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Scan Product' })).toBeTruthy());
    expect(screen.queryByText('Camera access is used only to read product barcodes.')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Scan Product' }));
    expect(screen.getByText('Camera access is used only to read product barcodes.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Allow Camera Access' }));
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it('keeps the local-only camera closed until the scan button is pressed', async () => {
    jest.mocked(loadBringSyncEnabled).mockResolvedValue(false);
    const screen = await render(<ScannerScreen />);

    await waitFor(() => expect(screen.getByTestId('open-scanner')).toBeTruthy());
    expect(screen.queryByTestId('camera-view')).toBeNull();
    expect(screen.getByTestId('open-scanner')).toHaveStyle({
      width: 56,
      height: 56,
      borderRadius: 28,
    });
    expect(screen.getByTestId('scan-button-icon')).toHaveStyle({ width: 27 });
    expect(screen.getByTestId('keyboard-avoiding-composer')).toHaveStyle({
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 124,
    });
    expect(screen.getByTestId('item-composer')).not.toHaveStyle({ position: 'absolute' });

    await fireEvent.press(screen.getByTestId('open-scanner'));
    expect(screen.getByTestId('scanner-drawer')).toBeTruthy();
    expect(screen.getByTestId('camera-view')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('camera-view')).toBeNull();
  });

  it('refreshes the configured Bring backend while the app remains open', async () => {
    const screen = await render(<ScannerScreen />);
    await waitFor(() => expect(syncShoppingList).toHaveBeenCalled());
    expect(screen.getByTestId('shopping-list-scroll')).toBeTruthy();
    expect(screen.getByTestId('shopping-list-scroll').props.refreshControl).toBeTruthy();
    jest.mocked(syncShoppingList).mockClear();

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(syncShoppingList).toHaveBeenCalledTimes(1);
  });

  it('syncs immediately when the enabled Bring list is pulled down', async () => {
    const storedItem = { barcode: cola.barcode, label: 'Soft drink', scannedAt: 1 };
    jest.mocked(loadShoppingList).mockResolvedValue([storedItem]);
    jest.mocked(syncShoppingList).mockResolvedValue([storedItem]);
    const screen = await render(<ScannerScreen />);
    await screen.findByTestId(`shopping-item-${cola.barcode}`);
    jest.mocked(syncShoppingList).mockClear();

    await act(async () => {
      screen.getByTestId('shopping-list-scroll').props.refreshControl.props.onRefresh();
      await Promise.resolve();
    });

    await waitFor(() => expect(syncShoppingList).toHaveBeenCalledTimes(1));
  });

  it('shows a retryable error when pull-to-refresh cannot reach Bring', async () => {
    const storedItem = { barcode: cola.barcode, label: 'Soft drink', scannedAt: 1 };
    jest.mocked(loadShoppingList).mockResolvedValue([storedItem]);
    jest.mocked(syncShoppingList).mockResolvedValueOnce([storedItem]);
    const screen = await render(<ScannerScreen />);
    await screen.findByTestId(`shopping-item-${cola.barcode}`);
    jest.mocked(syncShoppingList).mockRejectedValue(new Error('offline'));

    await act(async () => {
      screen.getByTestId('shopping-list-scroll').props.refreshControl.props.onRefresh();
      await Promise.resolve();
    });

    expect(
      screen.getByText('Could not sync with the provider. Pull down to try again.'),
    ).toBeTruthy();
  });

  it('shows camera guidance, supported codes, configuration notice, and saved history', async () => {
    jest.mocked(loadCredentials).mockResolvedValue(null);
    jest.mocked(loadSelectedList).mockResolvedValue(null);
    jest.mocked(getListSyncState).mockResolvedValue({ enabled: true, configured: false });
    jest.mocked(loadShoppingList).mockResolvedValue([
      {
        barcode: '11111111',
        label: 'Moon Milk',
        brand: 'Luna',
        imageUrl: 'https://images.example/moon-milk.png',
        scannedAt: 2,
      },
      { barcode: '22222222', label: 'Star Bread', scannedAt: 1 },
    ]);
    const screen = await render(<ScannerScreen />);
    await waitFor(() => expect(screen.getByText('Moon Milk')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('open-scanner'));
    // Keep this broad rendered-content assertion off the expensive RN accessibility traversal.
    const exactTextNodes = (text: string) =>
      screen.container.queryAll((instance) => instance.props.children === text);

    expect(exactTextNodes('Align the barcode inside the frame')).toHaveLength(1);
    expect(exactTextNodes('EAN-8, EAN-13, UPC-A and UPC-E are supported.')).toHaveLength(1);
    expect(exactTextNodes('Connect a sync provider and map this list in Settings.')).toHaveLength(
      1,
    );
    expect(screen.getByText('Moon Milk')).toBeTruthy();
    expect(screen.getByTestId('shopping-item-image-11111111').props.source).toEqual({
      uri: 'https://images.example/moon-milk.png',
    });
    expect(screen.getByTestId('shopping-item-11111111')).toHaveStyle({
      minHeight: 68,
      padding: 8,
      gap: 10,
    });
    expect(screen.getByTestId('shopping-item-image-11111111')).toHaveStyle({
      width: 52,
      height: 52,
    });
    expect(screen.getByTestId('shopping-item-image-22222222').props.source).toBeDefined();
    expect(screen.getByText('Luna')).toBeTruthy();
    expect(screen.getByText('22222222')).toBeTruthy();
  });

  it('renders saved items as tiles when that view is selected', async () => {
    jest.mocked(loadBringSyncEnabled).mockResolvedValue(false);
    jest.mocked(loadListViewMode).mockResolvedValue('tiles');
    jest.mocked(loadShoppingList).mockResolvedValue([
      {
        barcode: cola.barcode,
        label: cola.label,
        brand: cola.brand,
        imageUrl: cola.imageUrl,
        scannedAt: 1,
      },
    ]);

    const screen = await render(<ScannerScreen />);

    expect(await screen.findByTestId(`shopping-item-wrap-${cola.barcode}`)).toHaveStyle({
      width: '31%',
      minWidth: 0,
    });
    expect(screen.getByTestId(`shopping-item-${cola.barcode}`)).toHaveStyle({
      width: '100%',
      aspectRatio: 1,
      minHeight: 0,
      padding: 7,
      gap: 6,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    });
    expect(screen.getByTestId(`shopping-item-image-${cola.barcode}`)).toHaveStyle({
      width: 40,
      height: 40,
    });
    expect(screen.queryByText(cola.brand!)).toBeNull();
  });

  it('centers and reduces long item labels in tiles', async () => {
    const longLabel = 'Extra long intergalactic breakfast cereal family package';
    jest.mocked(loadBringSyncEnabled).mockResolvedValue(false);
    jest.mocked(loadListViewMode).mockResolvedValue('tiles');
    jest
      .mocked(loadShoppingList)
      .mockResolvedValue([{ barcode: cola.barcode, label: longLabel, scannedAt: 1 }]);

    const screen = await render(<ScannerScreen />);
    const label = await screen.findByText(longLabel);

    expect(label).toHaveStyle({ textAlign: 'center', fontSize: 12, lineHeight: 15 });
    expect(label.props.numberOfLines).toBe(3);
  });

  it('chooses the most centered in-frame barcode from a detection window', async () => {
    const screen = await render(<ScannerScreen />);
    await fireEvent.press(await screen.findByTestId('open-scanner'));

    await fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', scan('top-code', 175, 80));
    await fireEvent(
      screen.getByTestId('camera-view'),
      'barcodeScanned',
      scan('side-code', 55, 215),
    );
    await fireEvent(
      screen.getByTestId('camera-view'),
      'barcodeScanned',
      scan('center-code', 175, 215),
    );
    await act(async () => {
      jest.advanceTimersByTime(650);
      await Promise.resolve();
    });

    await waitFor(() => expect(lookupProduct).toHaveBeenCalledTimes(1));
    expect(lookupProduct).toHaveBeenCalledWith('center-code', [], {
      language: 'auto',
      labelStyle: 'generic',
    });
  });

  it('updates the scan-frame center when the camera layout width changes', async () => {
    const screen = await render(<ScannerScreen />);
    await fireEvent.press(await screen.findByTestId('open-scanner'));
    await fireEvent(screen.getByTestId('camera-view').parent!, 'layout', {
      nativeEvent: { layout: { width: 400 } },
    });

    await fireEvent(
      screen.getByTestId('camera-view'),
      'barcodeScanned',
      scan('old-center', 175, 215),
    );
    await fireEvent(
      screen.getByTestId('camera-view'),
      'barcodeScanned',
      scan('new-center', 200, 215),
    );
    await act(async () => {
      jest.advanceTimersByTime(650);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(lookupProduct).toHaveBeenCalledWith('new-center', [], expect.anything()),
    );
  });

  it('ignores positioned barcodes outside the frame and accepts a geometry-free fallback', async () => {
    const screen = await render(<ScannerScreen />);

    await emitScan(screen, scan('outside', 175, 80));
    expect(lookupProduct).not.toHaveBeenCalled();

    await emitScan(screen, { data: 'geometry-free', type: 'ean13' });
    await waitFor(() =>
      expect(lookupProduct).toHaveBeenCalledWith('geometry-free', [], expect.anything()),
    );
  });

  it('cancels a pending detection window when the scanner unmounts', async () => {
    const screen = await render(<ScannerScreen />);
    await fireEvent.press(await screen.findByTestId('open-scanner'));
    await fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', scan());

    await screen.unmount();
    jest.advanceTimersByTime(650);

    expect(lookupProduct).not.toHaveBeenCalled();
  });

  it('survives local configuration and history read errors as an unconfigured scanner', async () => {
    jest.mocked(loadBringSyncEnabled).mockResolvedValue(false);
    jest.mocked(getListSyncState).mockRejectedValue(new Error('keychain unavailable'));
    jest.mocked(loadShoppingList).mockRejectedValue(new Error('storage unavailable'));
    const screen = await render(<ScannerScreen />);

    expect(screen.queryByText('Connect a sync provider and map this list in Settings.')).toBeNull();
    expect(screen.queryByText('RECENT SCANS')).toBeNull();
  });
});

describe('scan-to-list flow', () => {
  it('adds a manual label-only item when Return is pressed', async () => {
    jest.mocked(loadBringSyncEnabled).mockResolvedValue(false);
    jest.spyOn(Date, 'now').mockReturnValue(1234);
    const manualItem = { barcode: 'manual:1234', label: 'Moon cheese', scannedAt: 1234 };
    jest.mocked(addShoppingListItem).mockResolvedValue([manualItem]);
    const screen = await render(<ScannerScreen />);
    const input = await screen.findByLabelText('New shopping item');
    expect(input.props.placeholder).toBe('Add…');
    expect(input.props.submitBehavior).toBe('submit');
    expect(input.props.editable).not.toBe(false);
    await fireEvent(input, 'submitEditing');
    expect(addShoppingListItem).not.toHaveBeenCalled();
    await fireEvent.changeText(input, '  Moon cheese  ');
    await fireEvent(input, 'submitEditing');

    await waitFor(() =>
      expect(addShoppingListItem).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: 'manual:1234',
          label: 'Moon cheese',
          exactLabel: 'Moon cheese',
          source: 'custom',
        }),
        'Moon cheese',
        undefined,
        'groceries',
      ),
    );
    expect(screen.getByText('Moon cheese')).toBeTruthy();
    expect(screen.queryByText('manual:1234')).toBeNull();
  });

  it('stores items locally without contacting Bring when sync is disabled', async () => {
    jest.mocked(loadBringSyncEnabled).mockResolvedValue(false);
    const screen = await render(<ScannerScreen />);
    await fireEvent.press(await screen.findByTestId('open-scanner'));
    await emitScan(screen);

    await fireEvent.press(screen.getByRole('button', { name: 'Add to Shopping List' }));

    await waitFor(() =>
      expect(addShoppingListItem).toHaveBeenCalledWith(cola, 'Soft drink', undefined, 'groceries'),
    );
    expect(addItem).not.toHaveBeenCalled();
    expect(screen.queryByText('Soft drink added to your shopping list.')).toBeNull();
  });

  it('opens item details and removes a local item only from the drawer button', async () => {
    const storedItem = {
      barcode: cola.barcode,
      label: 'Soft drink',
      brand: 'Comet',
      scannedAt: 1,
      stores: ['Migros'],
      source: 'open-products-family' as const,
      productType: 'food' as const,
    };
    jest.mocked(loadShoppingList).mockResolvedValue([storedItem]);
    jest.mocked(syncShoppingList).mockResolvedValue([storedItem]);
    jest.mocked(removeShoppingListItem).mockResolvedValue([]);
    const screen = await render(<ScannerScreen />);

    await fireEvent.press(await screen.findByTestId(`shopping-item-${cola.barcode}`));

    expect(screen.getByText('Item Details')).toBeTruthy();
    expect(screen.getByText('Migros')).toBeTruthy();
    expect(screen.getByText('Open Food Facts')).toBeTruthy();
    expect(screen.getByText(cola.barcode)).toBeTruthy();
    expect(removeShoppingListItem).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from List' }));
    expect(removeShoppingListItem).toHaveBeenCalledWith(cola.barcode, 'groceries');
    await waitFor(() => expect(screen.queryByText('Soft drink')).toBeNull());
  });

  it('shows only radio-button list choices in the title drawer', async () => {
    jest.mocked(loadBringSyncEnabled).mockResolvedValue(false);
    jest.mocked(loadShoppingLists).mockResolvedValue([
      { id: 'groceries', name: 'Groceries' },
      { id: 'party', name: 'Party' },
    ]);
    const screen = await render(<ScannerScreen />);

    await fireEvent.press(await screen.findByTestId('active-list-title'));
    expect(screen.getByText('Choose List')).toBeTruthy();
    expect(screen.getByTestId('list-picker-sheet')).toBeTruthy();
    expect(screen.getByTestId('local-list-radio-groceries')).toBeTruthy();
    expect(screen.getByTestId('local-list-radio-party')).toBeTruthy();
    expect(screen.queryByText('Create List')).toBeNull();
    expect(screen.queryByLabelText('List name')).toBeNull();
  });

  it('switches to an existing mapped list and closes both drawers through their controls', async () => {
    const pharmacy = {
      id: 'pharmacy',
      name: 'Pharmacy',
      syncTarget: {
        provider: 'bring' as const,
        remoteListId: 'bring-pharmacy',
        remoteListName: 'Shared Pharmacy',
      },
    };
    jest.mocked(loadShoppingLists).mockResolvedValue([
      {
        id: 'groceries',
        name: 'Groceries',
        syncTarget: {
          provider: 'bring',
          remoteListId: list.listUuid,
          remoteListName: list.name,
        },
      },
      pharmacy,
    ]);
    jest
      .mocked(loadShoppingList)
      .mockImplementation(async (id) =>
        id === 'pharmacy' ? [{ barcode: 'manual:meds', label: 'Bandages', scannedAt: 2 }] : [],
      );
    jest
      .mocked(syncShoppingList)
      .mockImplementation(async (id) =>
        id === 'pharmacy' ? [{ barcode: 'manual:meds', label: 'Bandages', scannedAt: 2 }] : [],
      );
    const screen = await render(<ScannerScreen />);

    await fireEvent.press(await screen.findByTestId('active-list-title'));
    expect(screen.queryByText('Shared Pharmacy')).toBeNull();
    await fireEvent.press(screen.getByText('Cancel'));
    expect(screen.queryByTestId('list-picker-modal')).toBeNull();

    await fireEvent.press(screen.getByTestId('active-list-title'));
    await fireEvent.press(screen.getByTestId('local-list-pharmacy'));
    await waitFor(() => expect(syncShoppingList).toHaveBeenCalledWith('pharmacy'));
    expect(screen.getByText('Pharmacy')).toBeTruthy();
    expect(screen.getByText('Bandages')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('shopping-item-manual:meds'));
    expect(screen.getByText('No store information available')).toBeTruthy();
    await fireEvent(screen.getByTestId('item-details-modal'), 'requestClose');
    expect(screen.queryByTestId('item-details-modal')).toBeNull();
  });

  it('removes a linked item from Bring before completing its local removal', async () => {
    const storedItem = {
      barcode: cola.barcode,
      label: 'Soft drink',
      scannedAt: 1,
      remoteItemId: 'remote-item',
      remoteSpecification: '2×',
    };
    jest.mocked(loadShoppingList).mockResolvedValue([storedItem]);
    jest.mocked(syncShoppingList).mockResolvedValue([storedItem]);
    jest.mocked(removeShoppingListItem).mockResolvedValue([]);
    const screen = await render(<ScannerScreen />);

    await fireEvent.press(await screen.findByTestId(`shopping-item-${cola.barcode}`));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from List' }));

    expect(removeFromSyncedList).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'groceries' }),
      storedItem,
    );
  });

  it('keeps the detail item available when local removal fails', async () => {
    const storedItem = { barcode: cola.barcode, label: 'Soft drink', scannedAt: 1 };
    jest.mocked(loadBringSyncEnabled).mockResolvedValue(false);
    jest.mocked(loadShoppingList).mockResolvedValue([storedItem]);
    jest.mocked(removeShoppingListItem).mockRejectedValue(new Error('storage unavailable'));
    const screen = await render(<ScannerScreen />);

    await fireEvent.press(await screen.findByTestId(`shopping-item-${cola.barcode}`));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from List' }));

    expect(screen.getByTestId(`shopping-item-${cola.barcode}`)).toBeTruthy();
  });

  it('opens the product sheet, records history, and shows all product details', async () => {
    const screen = await render(<ScannerScreen />);

    await emitScan(screen);

    expect(await screen.findByText('Add Item')).toBeTruthy();
    expect(screen.getByTestId('product-sheet')).toHaveStyle({
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
    });
    expect(screen.getAllByText('Comet Cola, 330ml')).toHaveLength(1);
    expect(screen.getAllByText('Comet')).toHaveLength(1);
    expect(screen.getByText(cola.barcode)).toBeTruthy();
    expect(screen.getByText('Open Food Facts')).toBeTruthy();
    expect(screen.getByTestId('product-image').props.source).toEqual({ uri: cola.imageUrl });
    expect(addShoppingListItem).not.toHaveBeenCalled();
  });

  it('edits the label and quantity and adds the item without a confirmation popup', async () => {
    const screen = await render(<ScannerScreen />);
    await emitScan(screen);
    await screen.findByText('Add Item');

    await fireEvent.changeText(screen.getByDisplayValue('Soft drink'), 'Party Cola');
    await fireEvent.press(screen.getByRole('button', { name: 'Increase quantity' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Increase quantity' }));
    expect(screen.getByLabelText('Quantity').props.value).toBe('2');
    await fireEvent.press(screen.getByRole('button', { name: 'Decrease quantity' }));
    expect(screen.getByLabelText('Quantity').props.value).toBe('1');
    await fireEvent.press(screen.getByRole('button', { name: 'Add to Shopping List' }));

    await waitFor(() => expect(syncShoppingList).toHaveBeenCalled());
    expect(addShoppingListItem).toHaveBeenCalledWith(cola, 'Party Cola', 1, 'groceries');
    expect(screen.queryByText('Party Cola added locally and synced.')).toBeNull();
    expect(screen.queryByText('Add Item')).toBeNull();
    expect(screen.queryByTestId('camera-view')).toBeNull();
    expect(screen.getByTestId('open-scanner')).toBeTruthy();
  });

  it('adds an item without a quantity when none is selected', async () => {
    const screen = await render(<ScannerScreen />);
    await emitScan(screen);
    await screen.findByText('Add Item');

    await fireEvent.press(screen.getByRole('button', { name: 'Add to Shopping List' }));

    await waitFor(() => expect(syncShoppingList).toHaveBeenCalled());
    expect(addShoppingListItem).toHaveBeenCalledWith(cola, 'Soft drink', undefined, 'groceries');
  });

  it('keeps an item locally when background Bring sync fails', async () => {
    jest.mocked(syncShoppingList).mockRejectedValue(new Error('Bring unavailable'));
    const screen = await render(<ScannerScreen />);
    await emitScan(screen);
    await screen.findByText('Add Item');

    await fireEvent.press(screen.getByRole('button', { name: 'Add to Shopping List' }));
    expect(screen.queryByText('Soft drink added to your shopping list.')).toBeNull();
    expect(addShoppingListItem).toHaveBeenCalled();
    expect(screen.queryByText('Add Item')).toBeNull();
  });

  it('still adds locally if Bring configuration disappears', async () => {
    const screen = await render(<ScannerScreen />);
    await emitScan(screen);
    await screen.findByText('Add Item');
    jest.mocked(loadCredentials).mockResolvedValue(null);
    jest.mocked(syncShoppingList).mockRejectedValue(new Error('Not configured'));

    await fireEvent.press(screen.getByRole('button', { name: 'Add to Shopping List' }));

    expect(screen.queryByText('Soft drink added to your shopping list.')).toBeNull();
    expect(addShoppingListItem).toHaveBeenCalled();
  });

  it('closes the sheet from Cancel and from the native close request, then permits another scan', async () => {
    const screen = await render(<ScannerScreen />);
    await emitScan(screen);
    await screen.findByText('Add Item');

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Add Item')).toBeNull();

    await emitScan(screen, scan('second-code'));
    await screen.findByText('Add Item');
    await fireEvent(screen.getByTestId('product-modal'), 'requestClose');
    expect(screen.queryByText('Add Item')).toBeNull();
    expect(lookupProduct).toHaveBeenCalledTimes(2);
  });
});

describe('product sheet controls', () => {
  it('sanitizes and caps manual quantity input, including empty decrement behavior', async () => {
    const onAdd = jest.fn();
    const screen = await render(
      <ProductSheet product={cola} busy={false} configured onAdd={onAdd} onClose={jest.fn()} />,
    );
    const quantity = screen.getByLabelText('Quantity');

    await fireEvent.changeText(quantity, 'abc100');
    expect(quantity.props.value).toBe('99');
    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();

    await fireEvent.changeText(quantity, '1');
    await fireEvent.press(screen.getByRole('button', { name: 'Decrease quantity' }));
    expect(quantity.props.value).toBe('');
    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeDisabled();

    await fireEvent.changeText(quantity, '004');
    expect(quantity.props.value).toBe('4');
    await fireEvent.press(screen.getByRole('button', { name: 'Add to Shopping List' }));
    expect(onAdd).toHaveBeenCalledWith('Soft drink', 4);
  });

  it('disables adding for a blank label, while busy, or without configuration', async () => {
    const screen = await render(
      <ProductSheet product={cola} busy={false} configured onAdd={jest.fn()} onClose={jest.fn()} />,
    );
    const add = screen.getByRole('button', { name: 'Add to Shopping List' });
    await fireEvent.changeText(screen.getByDisplayValue('Soft drink'), '   ');
    expect(add).toBeDisabled();

    await screen.rerender(
      <ProductSheet product={cola} busy configured onAdd={jest.fn()} onClose={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Add to Shopping List' })).toBeDisabled();

    await screen.rerender(
      <ProductSheet
        product={cola}
        busy={false}
        configured={false}
        onAdd={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add to Shopping List' })).toBeDisabled();
    expect(
      screen.getByText('Configure a shopping list in Settings before adding this item.'),
    ).toBeTruthy();
  });

  it.each([
    ['custom', undefined, 'Custom label'],
    ['open-products-family', 'food', 'Open Food Facts'],
    ['open-products-family', 'product', 'Open Products Facts'],
    ['open-products-family', 'beauty', 'Open Beauty Facts'],
    ['open-products-family', 'petfood', 'Open Pet Food Facts'],
    ['open-products-family', undefined, 'Open Products Facts'],
  ] as const)('shows the source for %s/%s products', async (source, productType, expected) => {
    const product: Product = {
      barcode: cola.barcode,
      label: cola.label,
      exactLabel: cola.exactLabel,
      source,
      productType,
    };
    const screen = await render(
      <ProductSheet
        product={product}
        busy={false}
        configured
        onAdd={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText(expected)).toBeTruthy();
    expect(screen.getByTestId('product-placeholder-icon')).toBeTruthy();
  });
});
