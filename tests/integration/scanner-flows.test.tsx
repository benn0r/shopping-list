import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ProductSheet, ScannerScreen } from '../../src/screens/ScannerScreen';
import { addItem } from '../../src/services/bringApi';
import { lookupProduct } from '../../src/services/productLookup';
import {
  loadCredentials,
  addShoppingListItem,
  loadBringSyncEnabled,
  loadCustomBarcodes,
  loadLookupPreferences,
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

jest.mock('../../src/services/bringApi', () => ({ addItem: jest.fn() }));
jest.mock('../../src/services/productLookup', () => ({ lookupProduct: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  loadCredentials: jest.fn(),
  addShoppingListItem: jest.fn(),
  loadBringSyncEnabled: jest.fn(),
  loadCustomBarcodes: jest.fn(),
  loadLookupPreferences: jest.fn(),
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
  jest.mocked(loadShoppingList).mockResolvedValue([]);
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
  it('renders a safe empty state while camera permission is loading', async () => {
    mockUseCameraPermissions.mockReturnValue([null, mockRequestPermission]);
    const screen = await render(<ScannerScreen />);

    expect(screen.queryByText('Scan')).toBeNull();
    expect(screen.queryByTestId('camera-view')).toBeNull();
  });

  it('requests camera access when permission is denied', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: false }, mockRequestPermission]);
    const screen = await render(<ScannerScreen />);

    expect(screen.getByText('Camera access is used only to read product barcodes.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Allow Camera Access' }));
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it('shows camera guidance, supported codes, configuration notice, and saved history', async () => {
    jest.mocked(loadCredentials).mockResolvedValue(null);
    jest.mocked(loadSelectedList).mockResolvedValue(null);
    jest.mocked(loadShoppingList).mockResolvedValue([
      { barcode: '11111111', label: 'Moon Milk', brand: 'Luna', scannedAt: 2 },
      { barcode: '22222222', label: 'Star Bread', scannedAt: 1 },
    ]);
    const screen = await render(<ScannerScreen />);
    await waitFor(() => expect(screen.getByText('Moon Milk')).toBeTruthy());
    // Keep this broad rendered-content assertion off the expensive RN accessibility traversal.
    const exactTextNodes = (text: string) =>
      screen.container.queryAll((instance) => instance.props.children === text);

    expect(exactTextNodes('Align the barcode inside the frame')).toHaveLength(1);
    expect(exactTextNodes('EAN-8, EAN-13, UPC-A and UPC-E are supported.')).toHaveLength(1);
    expect(exactTextNodes('Connect Bring and choose a shopping list in Settings.')).toHaveLength(1);
    expect(screen.getByText('Moon Milk')).toBeTruthy();
    expect(screen.getByText('Luna')).toBeTruthy();
    expect(screen.getByText('22222222')).toBeTruthy();
  });

  it('chooses the most centered in-frame barcode from a detection window', async () => {
    const screen = await render(<ScannerScreen />);

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
    await fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', scan());

    await screen.unmount();
    jest.advanceTimersByTime(650);

    expect(lookupProduct).not.toHaveBeenCalled();
  });

  it('survives local configuration and history read errors as an unconfigured scanner', async () => {
    jest.mocked(loadBringSyncEnabled).mockResolvedValue(false);
    jest.mocked(loadCredentials).mockRejectedValue(new Error('keychain unavailable'));
    jest.mocked(loadShoppingList).mockRejectedValue(new Error('storage unavailable'));
    const screen = await render(<ScannerScreen />);

    expect(screen.queryByText('Connect Bring and choose a shopping list in Settings.')).toBeNull();
    expect(screen.queryByText('RECENT SCANS')).toBeNull();
  });
});

describe('scan-to-list flow', () => {
  it('stores items locally without contacting Bring when sync is disabled', async () => {
    jest.mocked(loadBringSyncEnabled).mockResolvedValue(false);
    const screen = await render(<ScannerScreen />);
    await emitScan(screen);

    await fireEvent.press(screen.getByRole('button', { name: 'Add to Shopping List' }));

    await waitFor(() =>
      expect(addShoppingListItem).toHaveBeenCalledWith(cola, 'Soft drink', undefined),
    );
    expect(addItem).not.toHaveBeenCalled();
    expect(await screen.findByText('Soft drink added to your shopping list.')).toBeTruthy();
  });

  it('marks a local item as purchased when it is pressed', async () => {
    jest
      .mocked(loadShoppingList)
      .mockResolvedValue([
        { barcode: cola.barcode, label: 'Soft drink', brand: 'Comet', scannedAt: 1 },
      ]);
    jest.mocked(removeShoppingListItem).mockResolvedValue([]);
    const screen = await render(<ScannerScreen />);

    await fireEvent.press(await screen.findByTestId(`shopping-item-${cola.barcode}`));

    expect(removeShoppingListItem).toHaveBeenCalledWith(cola.barcode);
    await waitFor(() => expect(screen.queryByText('Soft drink')).toBeNull());
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

  it('edits the label and quantity, adds the item, and dismisses the confirmation', async () => {
    const screen = await render(<ScannerScreen />);
    await emitScan(screen);
    await screen.findByText('Add Item');

    await fireEvent.changeText(screen.getByDisplayValue('Soft drink'), 'Party Cola');
    await fireEvent.press(screen.getByRole('button', { name: 'Increase quantity' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Increase quantity' }));
    expect(screen.getByLabelText('Quantity').props.value).toBe('2');
    await fireEvent.press(screen.getByRole('button', { name: 'Decrease quantity' }));
    expect(screen.getByLabelText('Quantity').props.value).toBe('1');
    await fireEvent.press(screen.getByRole('button', { name: 'Add and Sync to Bring' }));

    await waitFor(() =>
      expect(addItem).toHaveBeenCalledWith(credentials, list.listUuid, 'Party Cola', 1),
    );
    expect(await screen.findByText('Party Cola added locally and synced to Bring.')).toBeTruthy();
    expect(screen.queryByText('Add Item')).toBeNull();
    expect(screen.getByTestId('camera-view').props.cameraActive).toBe(true);

    await act(async () => jest.advanceTimersByTime(3000));
    expect(screen.queryByText('Party Cola added locally and synced to Bring.')).toBeNull();
  });

  it('adds an item without a quantity when none is selected', async () => {
    const screen = await render(<ScannerScreen />);
    await emitScan(screen);
    await screen.findByText('Add Item');

    await fireEvent.press(screen.getByRole('button', { name: 'Add and Sync to Bring' }));

    await waitFor(() =>
      expect(addItem).toHaveBeenCalledWith(credentials, list.listUuid, 'Soft drink', undefined),
    );
  });

  it('keeps the sheet open on a Bring failure and allows retrying', async () => {
    jest
      .mocked(addItem)
      .mockRejectedValueOnce(new Error('Bring unavailable'))
      .mockResolvedValueOnce(undefined);
    const screen = await render(<ScannerScreen />);
    await emitScan(screen);
    await screen.findByText('Add Item');

    await fireEvent.press(screen.getByRole('button', { name: 'Add and Sync to Bring' }));
    expect(await screen.findByText('Could not add the item.')).toBeTruthy();
    expect(screen.getByText('Add Item')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Add and Sync to Bring' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Soft drink added locally and synced to Bring.')).toBeTruthy();
  });

  it('shows the configuration error if credentials disappear before adding', async () => {
    const screen = await render(<ScannerScreen />);
    await emitScan(screen);
    await screen.findByText('Add Item');
    jest.mocked(loadCredentials).mockResolvedValue(null);

    await fireEvent.press(screen.getByRole('button', { name: 'Add and Sync to Bring' }));

    expect(
      await screen.findByText('Configure your Bring account and shopping list first.'),
    ).toBeTruthy();
    expect(addItem).not.toHaveBeenCalled();
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
    expect(screen.getByText('▦')).toBeTruthy();
  });
});
