import { expect, test } from '@playwright/test';
import { createApiState, prepareApp, selectProviderList, signIn } from './support';

test('creates a store and preserves a completed shopping with purchased items', async ({
  page,
}) => {
  const state = createApiState();
  await prepareApp(page, state);
  await signIn(page);

  await page.getByTestId('tab-settings').click();
  await selectProviderList(page);
  await page.getByRole('button', { name: 'Add Store' }).click();
  await page.getByLabel('Store name').fill('Migros');
  await page.getByRole('button', { name: 'Create Store' }).click();

  state.bringItems.push({ uuid: 'bring-bread', itemId: 'Bread', specification: '' });

  await page.evaluate(() => {
    const lists = JSON.parse(window.localStorage.getItem('shopping-lists-v2') || '[]');
    lists.push({ id: 'errands', name: 'Errands' });
    window.localStorage.setItem('shopping-lists-v2', JSON.stringify(lists));
    window.localStorage.setItem(
      'shopping-list-items-v2',
      JSON.stringify({
        groceries: [
          {
            barcode: 'manual:bread',
            label: 'Bread',
            scannedAt: Date.now(),
            remoteItemId: 'bring-bread',
          },
        ],
        errands: [
          {
            barcode: 'manual:batteries',
            label: 'Batteries',
            scannedAt: Date.now(),
          },
        ],
      }),
    );
  });

  await page.getByTestId('tab-shopping').click();
  await expect(page.getByRole('heading', { name: 'Shopping', exact: true })).toBeVisible();
  await expect(page.getByTestId('shopping-store-select')).toContainText('Migros');
  await expect(page.getByTestId('shopping-list-select')).toContainText('Groceries');
  await page.getByTestId('shopping-list-select').click();
  await page.getByTestId('shopping-option-errands').click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('shopping-list-select')).toContainText('Groceries, Errands');
  await page.getByRole('button', { name: 'Start Shopping' }).click();

  await expect(page.getByTestId('shopping-item-manual:batteries')).toBeVisible();
  await page.getByTestId('shopping-item-manual:batteries').click();
  await page.getByTestId('purchased-item-manual:batteries').click();
  await expect(page.getByTestId('shopping-item-manual:batteries')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const items = JSON.parse(window.localStorage.getItem('shopping-list-items-v2') || '{}');
        return items.errands?.some(
          (item: { barcode: string }) => item.barcode === 'manual:batteries',
        );
      }),
    )
    .toBe(true);

  await page.getByTestId('shopping-item-manual:bread').click();
  await expect(page.getByTestId('shopping-item-manual:bread')).toBeHidden();
  await expect(page.getByTestId('purchased-item-manual:bread')).toBeVisible();
  await expect.poll(() => state.bringRecently.map((item) => item.uuid)).toContain('bring-bread');
  await page.getByTestId('purchased-item-manual:bread').click();
  await expect(page.getByTestId('shopping-item-manual:bread')).toBeVisible();
  await expect.poll(() => state.restoredItemUuids).toContain('bring-bread');
  await expect.poll(() => state.bringItems.map((item) => item.uuid)).toContain('bring-bread');
  await page.getByTestId('shopping-item-manual:bread').click();
  await page.getByRole('button', { name: 'Finish Shopping' }).click();

  await page.getByTestId(/^shopping-history-/).click();
  await expect(page.getByRole('heading', { name: 'Migros', exact: true })).toBeVisible();
  await expect(page.getByText('Purchased Items')).toBeVisible();
  await expect(page.getByText('Bread', { exact: true })).toBeVisible();
});
