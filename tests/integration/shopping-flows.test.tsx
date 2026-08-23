import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../src/i18n';
import { ShoppingScreen } from '../../src/screens/ShoppingScreen';
import * as storage from '../../src/services/storage';
import * as shoppingSync from '../../src/services/shoppingListSync';
import {
  addShoppingListItem,
  createStore,
  createShoppingList,
  createShoppingSession,
  completeShoppingSession,
  loadShoppingList,
  loadShoppingSessions,
  saveShoppingList,
  saveListViewMode,
} from '../../src/services/storage';

jest.mock('@react-navigation/native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(callback, [callback]),
  };
});

it('selects a store and list in drawers and uses the tile preference', async () => {
  const [migros, coop] = await createStore('Migros').then(async (first) => [
    first[0],
    (await createStore('Coop'))[1],
  ]);
  expect(migros.name).toBe('Migros');
  const errands = await createShoppingList('Errands');
  await saveListViewMode('tiles');
  await addShoppingListItem(
    { barcode: 'manual:item', label: 'Bags', exactLabel: 'Bags', source: 'custom' },
    'Bags',
    undefined,
    errands.id,
  );

  const screen = await render(
    <I18nProvider>
      <ShoppingScreen />
    </I18nProvider>,
  );
  await waitFor(() => expect(screen.getByText('Migros')).toBeTruthy());
  expect(screen.queryByText('New Shopping')).toBeNull();
  expect(screen.queryByText('The currently selected shopping list is used by default.')).toBeNull();
  await fireEvent.press(screen.getByTestId('shopping-store-select'));
  await fireEvent(screen.getByTestId('shopping-picker-modal'), 'requestClose');
  await fireEvent.press(screen.getByTestId('shopping-store-select'));
  await fireEvent.press(screen.getByTestId(`shopping-option-${coop.id}`));
  await fireEvent.press(screen.getByTestId('shopping-list-select'));
  await fireEvent.press(screen.getByTestId(`shopping-option-${errands.id}`));
  await fireEvent.press(screen.getByRole('button', { name: 'Start Shopping' }));

  expect(screen.getByTestId('shopping-item-wrap-manual:item')).toHaveStyle({ width: '31%' });
});

it('shops multiple lists together and restores an item to its source list', async () => {
  await createStore('Shared Market');
  const errands = await createShoppingList('Errands');
  await addShoppingListItem(
    { barcode: 'manual:milk', label: 'Milk', exactLabel: 'Milk', source: 'custom' },
    'Milk',
    undefined,
    'groceries',
  );
  await addShoppingListItem(
    { barcode: 'manual:bags', label: 'Bags', exactLabel: 'Bags', source: 'custom' },
    'Bags',
    undefined,
    errands.id,
  );
  const restoreSync = jest.spyOn(shoppingSync, 'restoreToSyncedList').mockResolvedValue(true);

  const screen = await render(
    <I18nProvider>
      <ShoppingScreen />
    </I18nProvider>,
  );
  await waitFor(() => expect(screen.getByText('Shared Market')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('shopping-list-select'));
  expect(screen.getByTestId('shopping-option-groceries').props.accessibilityState).toMatchObject({
    selected: true,
  });
  await fireEvent.press(screen.getByTestId(`shopping-option-${errands.id}`));
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByText('Groceries, Errands')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Start Shopping' }));

  expect(await screen.findByText('Milk')).toBeTruthy();
  expect(screen.getByText('Bags')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('shopping-item-manual:bags'));
  await fireEvent.press(screen.getByTestId('purchased-item-manual:bags'));

  await expect(loadShoppingList(errands.id)).resolves.toEqual(
    expect.arrayContaining([expect.objectContaining({ barcode: 'manual:bags' })]),
  );
  await expect(loadShoppingList('groceries')).resolves.toEqual(
    expect.not.arrayContaining([expect.objectContaining({ barcode: 'manual:bags' })]),
  );
  expect(restoreSync).toHaveBeenCalledWith(
    expect.objectContaining({ id: errands.id }),
    expect.objectContaining({ barcode: 'manual:bags' }),
  );
  restoreSync.mockRestore();
});

it('resumes an active multi-list shopping with items from every selected list', async () => {
  const store = (await createStore('Resume Market'))[0];
  const groceries = (await storage.loadShoppingLists())[0];
  const errands = await createShoppingList('Resume Errands');
  await addShoppingListItem(
    { barcode: 'manual:first', label: 'First', exactLabel: 'First', source: 'custom' },
    'First',
    undefined,
    groceries.id,
  );
  await addShoppingListItem(
    { barcode: 'manual:second', label: 'Second', exactLabel: 'Second', source: 'custom' },
    'Second',
    undefined,
    errands.id,
  );
  await createShoppingSession(store, [groceries, errands], 10);

  const screen = await render(
    <I18nProvider>
      <ShoppingScreen />
    </I18nProvider>,
  );

  expect(await screen.findByText(/Groceries, Resume Errands ·/)).toBeTruthy();
  expect(screen.getByText('First')).toBeTruthy();
  expect(screen.getByText('Second')).toBeTruthy();
});

it('shows an empty completed shopping and closes its detail drawer', async () => {
  const store = (await createStore('Empty Market'))[0];
  const list = await createShoppingList('Empty List');
  const session = await createShoppingSession(store, list, 10);
  await completeShoppingSession(session.id, 20);
  const second = await createShoppingSession(store, list, 30);
  await completeShoppingSession(second.id, 40);

  const screen = await render(
    <I18nProvider>
      <ShoppingScreen />
    </I18nProvider>,
  );
  await fireEvent.press(await screen.findByTestId(`shopping-history-${session.id}`));
  expect(screen.getByText('No items were purchased.')).toBeTruthy();
  await fireEvent(screen.getByTestId('shopping-detail-modal'), 'requestClose');
  expect(screen.queryByText('No items were purchased.')).toBeNull();

  await fireEvent.press(screen.getByTestId(`delete-shopping-${session.id}`));
  await waitFor(() => expect(screen.queryByTestId(`shopping-history-${session.id}`)).toBeNull());
  await expect(loadShoppingSessions()).resolves.toEqual([
    expect.objectContaining({ id: second.id }),
  ]);
});

it('shows an error when recording a purchase fails', async () => {
  await createStore('Failure Market');
  await addShoppingListItem(
    { barcode: 'manual:failure', label: 'Failure', exactLabel: 'Failure', source: 'custom' },
    'Failure',
  );
  const screen = await render(
    <I18nProvider>
      <ShoppingScreen />
    </I18nProvider>,
  );
  await waitFor(() => expect(screen.getByText('Failure Market')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Start Shopping' }));
  jest.spyOn(storage, 'recordShoppingPurchase').mockRejectedValueOnce(new Error('disk full'));
  await fireEvent.press(screen.getByTestId('shopping-item-manual:failure'));
  expect(await screen.findByText('Could not record the purchase.')).toBeTruthy();
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('requires a configured store before starting', async () => {
  const screen = await render(
    <I18nProvider>
      <ShoppingScreen />
    </I18nProvider>,
  );
  expect(
    await screen.findByText('Create a store in Settings before starting a shopping.'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Start Shopping' }).props.accessibilityState).toEqual({
    disabled: true,
  });
});

it('shows an error when restoring a purchased item fails', async () => {
  await createStore('Restore Market');
  await addShoppingListItem(
    { barcode: 'manual:restore', label: 'Restore', exactLabel: 'Restore', source: 'custom' },
    'Restore',
  );
  const screen = await render(
    <I18nProvider>
      <ShoppingScreen />
    </I18nProvider>,
  );
  await waitFor(() => expect(screen.getByText('Restore Market')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Start Shopping' }));
  await fireEvent.press(screen.getByTestId('shopping-item-manual:restore'));
  jest.spyOn(storage, 'restoreShoppingPurchase').mockRejectedValueOnce(new Error('disk full'));
  await fireEvent.press(screen.getByTestId('purchased-item-manual:restore'));
  expect(await screen.findByText('Could not restore the item.')).toBeTruthy();
});

it('filters store items, records purchases, and exposes completed shopping details', async () => {
  await createStore('Migros');
  await addShoppingListItem(
    {
      barcode: '7611111111111',
      label: 'Milk',
      exactLabel: 'Milk',
      source: 'open-products-family',
      stores: ['Migros'],
    },
    'Milk',
  );
  await saveShoppingList(
    (await loadShoppingList()).map((item) =>
      item.barcode === '7611111111111'
        ? { ...item, remoteItemId: 'bring-milk', remoteSpecification: '1×' }
        : item,
    ),
  );
  await addShoppingListItem(
    {
      barcode: '7612222222222',
      label: 'Bread',
      exactLabel: 'Bread',
      source: 'custom',
    },
    'Bread',
  );
  await addShoppingListItem(
    {
      barcode: '7613333333333',
      label: 'Tea',
      exactLabel: 'Tea',
      source: 'open-products-family',
      stores: ['Coop'],
    },
    'Tea',
  );

  const screen = await render(
    <I18nProvider>
      <ShoppingScreen />
    </I18nProvider>,
  );

  await waitFor(() => expect(screen.getByText('Migros')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Start Shopping' }));
  expect(await screen.findByText('Milk')).toBeTruthy();
  expect(screen.getByText('Bread')).toBeTruthy();
  expect(screen.queryByText('Tea')).toBeNull();

  await fireEvent.press(screen.getByTestId('shopping-item-7611111111111'));
  await waitFor(() => expect(screen.queryByTestId('shopping-item-7611111111111')).toBeNull());
  await expect(loadShoppingList()).resolves.toEqual(
    expect.not.arrayContaining([expect.objectContaining({ barcode: '7611111111111' })]),
  );

  const sync = jest.spyOn(shoppingSync, 'restoreToSyncedList').mockResolvedValue(true);
  await fireEvent.press(screen.getByTestId('purchased-item-7611111111111'));
  await waitFor(() => expect(screen.getByTestId('shopping-item-7611111111111')).toBeTruthy());
  expect(sync).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'groceries' }),
    expect.objectContaining({ barcode: '7611111111111' }),
  );
  expect(sync.mock.calls[0][1]).toMatchObject({
    remoteItemId: 'bring-milk',
    remoteSpecification: '1×',
  });
  expect((await loadShoppingList())[0]).not.toHaveProperty('remoteItemId');
  await expect(loadShoppingList()).resolves.toEqual(
    expect.arrayContaining([expect.objectContaining({ barcode: '7611111111111' })]),
  );
  await fireEvent.press(screen.getByTestId('shopping-item-7611111111111'));

  await fireEvent.press(screen.getByRole('button', { name: 'Finish Shopping' }));
  const session = (await loadShoppingSessions())[0];
  expect(session.completedAt).toBeTruthy();
  expect(session.purchasedItems[0]).toMatchObject({ label: 'Milk' });

  await fireEvent.press(screen.getByTestId(`shopping-history-${session.id}`));
  expect(screen.getByText('Purchased Items')).toBeTruthy();
  expect(screen.getByText('Milk')).toBeTruthy();
});
