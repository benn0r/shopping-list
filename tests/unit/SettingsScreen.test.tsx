import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SettingsScreen } from '../../src/screens/SettingsScreen';

jest.mock('../../src/services/storage', () => ({
  DEFAULT_LOOKUP_PREFERENCES: { language: 'auto', labelStyle: 'generic' },
  loadCredentials: jest.fn().mockResolvedValue(null),
  loadSelectedList: jest.fn().mockResolvedValue(null),
  loadCustomBarcodes: jest.fn().mockResolvedValue([]),
  loadLookupPreferences: jest.fn().mockResolvedValue({ language: 'auto', labelStyle: 'generic' }),
  loadBringSyncEnabled: jest.fn().mockResolvedValue(false),
  loadListViewMode: jest.fn().mockResolvedValue('list'),
  loadShoppingLists: jest.fn().mockResolvedValue([{ id: 'groceries', name: 'Groceries' }]),
  saveBringSyncEnabled: jest.fn(),
  saveListViewMode: jest.fn(),
  setShoppingListBringMapping: jest.fn(),
  subscribeShoppingLists: jest.fn().mockReturnValue(() => {}),
  saveCredentials: jest.fn(),
  saveSelectedList: jest.fn(),
  saveCustomBarcodes: jest.fn(),
  saveLookupPreferences: jest.fn(),
}));

describe('custom barcode settings', () => {
  it('opens the editor in a modal instead of rendering it inline', async () => {
    const screen = await render(<SettingsScreen />);

    await waitFor(() => expect(screen.getByText('Custom Barcodes')).toBeTruthy());
    expect(screen.queryByText('Save Custom Barcode')).toBeNull();

    await fireEvent.press(screen.getByText('Custom Barcodes'));

    expect(screen.getByText('Save Custom Barcode')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
    expect(screen.getByTestId('custom-barcodes-sheet')).toHaveStyle({
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(screen.queryByText('Save Custom Barcode')).toBeNull();
  });

  it('closes the editor for the native modal close request', async () => {
    const screen = await render(<SettingsScreen />);
    await fireEvent.press(screen.getByText('Custom Barcodes'));
    expect(screen.getByText('Save Custom Barcode')).toBeTruthy();

    await fireEvent(screen.getByTestId('custom-barcodes-modal'), 'requestClose');

    expect(screen.queryByText('Save Custom Barcode')).toBeNull();
  });
});
