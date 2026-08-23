import { expect, test } from '@playwright/test';
import { createApiState, FANTASY_LISTS, prepareApp, selectProviderList, signIn } from './support';

async function openSettings(page: import('@playwright/test').Page) {
  await signIn(page);
  await page.getByTestId('tab-settings').click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
}

test('creates, renames, and deletes local shopping lists in Settings', async ({ page }) => {
  const state = createApiState();
  await prepareApp(page, state);
  await openSettings(page);

  await page.getByRole('button', { name: 'Add List' }).click();
  await page.getByLabel('List name').fill('Weekend');
  await page.getByRole('button', { name: 'Create List' }).click();
  const editor = page.getByTestId(/^list-editor-/).filter({ hasText: 'Weekend' });
  await editor.getByRole('button', { name: 'Edit Weekend' }).click();
  await page.getByLabel('List name').fill('Errands');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Errands', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Edit Errands' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete List' }).click();
  await expect(page.getByText('Errands', { exact: true })).toBeHidden();
});

test('selects every language and product-label preference in the browser', async ({ page }) => {
  const state = createApiState();
  await prepareApp(page, state);
  await openSettings(page);

  const heading = page.getByRole('heading', { name: 'Settings', exact: true });
  const headingBeforeSave = await heading.boundingBox();
  expect(headingBeforeSave).not.toBeNull();
  await selectProviderList(page, 1);
  const status = page.getByTestId('settings-status');
  await expect(status).toBeHidden();
  const headingAfterSave = await heading.boundingBox();
  expect(headingAfterSave).not.toBeNull();
  expect(headingAfterSave?.y).toBe(headingBeforeSave?.y);

  for (const [value, title] of [
    ['auto', 'Automatic'],
    ['de', 'German'],
    ['en', 'English'],
    ['fr', 'French'],
    ['it', 'Italian'],
  ] as const) {
    await page.getByTestId(`product-language-${value}`).click();
    await expect(page.getByTestId(`product-language-${value}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(status).toContainText(`Product language set to ${title}.`);
  }
  for (const [value, title] of [
    ['generic', 'Generic'],
    ['exact', 'Exact Product'],
    ['ask', 'Ask Every Time'],
  ] as const) {
    await page.getByTestId(`label-style-${value}`).click();
    await expect(page.getByTestId(`label-style-${value}`)).toHaveAttribute('aria-selected', 'true');
    await expect(status).toContainText(`Synced item label set to ${title}.`);
  }

  const appLanguages = [
    ['de', 'Einstellungen', 'Deutsch'],
    ['fr', 'Réglages', 'Français'],
    ['it', 'Impostazioni', 'Italiano'],
    ['pt', 'Definições', 'Português'],
    ['pt-BR', 'Ajustes', 'Português (Brasil)'],
    ['en', 'Settings', 'English'],
  ] as const;
  for (const [value, heading, languageName] of appLanguages) {
    await page.getByTestId(`app-language-${value}`).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByTestId(`app-language-${value}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(status).toContainText(languageName);
  }

  await page.getByTestId('app-language-pt-BR').click();
  await expect(page.getByRole('heading', { name: 'Ajustes', exact: true })).toBeVisible();
  await expect(status).toContainText('Português (Brasil)');

  await page.reload();
  await page.getByTestId('tab-settings').click();
  await expect(page.getByRole('button', { name: 'Disconnect Bring' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ajustes', exact: true })).toBeVisible();
  for (const testId of ['product-language-it', 'label-style-ask', 'app-language-pt-BR']) {
    await expect(page.getByTestId(testId)).toHaveAttribute('aria-selected', 'true');
  }
  await expect(page.getByTestId('list-editor-groceries')).toContainText(FANTASY_LISTS[1].name);
  await expect(page.getByTestId('tab-scan')).toContainText('Lista de compras');
  await page.getByTestId('tab-scan').click();
  await expect(page.getByRole('heading', { name: 'Groceries', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Scan Product' }).click();
  await expect(
    page.getByText('Alinhe o código de barras dentro da moldura', { exact: true }),
  ).toBeVisible();
});

test('validates, saves, replaces, and removes custom barcodes', async ({ page }) => {
  const state = createApiState();
  await prepareApp(page, state);
  await openSettings(page);
  await page.getByTestId('custom-barcodes-open').click();
  await expect(page.getByTestId('custom-barcodes-sheet')).toBeVisible();

  await page.getByRole('button', { name: 'Save Custom Barcode' }).click();
  await expect(page.getByTestId('custom-status')).toContainText(
    'Enter an 8–14 digit barcode and a label.',
  );

  await page.getByLabel('Barcode', { exact: true }).fill('76 1234 5678 901');
  await page.getByLabel('Item Label').fill('Moon Towels');
  await page.getByRole('button', { name: 'Save Custom Barcode' }).click();
  await expect(page.getByText('Moon Towels')).toBeVisible();
  await expect(page.getByText('7612345678901')).toBeVisible();

  await page.getByLabel('Barcode', { exact: true }).fill('7612345678901');
  await page.getByLabel('Item Label').fill('Lunar Towels');
  await page.getByRole('button', { name: 'Save Custom Barcode' }).click();
  await expect(page.getByText('Moon Towels')).toBeHidden();
  await expect(page.getByText('Lunar Towels')).toHaveCount(1);
  await expect(page.getByTestId('custom-status')).toBeHidden();

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('custom-barcodes-sheet')).toBeHidden();
  await page.reload();
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('custom-barcodes-open').click();
  await expect(page.getByText('Lunar Towels')).toHaveCount(1);
  await expect(page.getByText('7612345678901')).toBeVisible();

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByTestId('delete-custom-7612345678901').click();
  await expect(page.getByText('Lunar Towels')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('delete-custom-7612345678901').click();
  await expect(page.getByText('Lunar Towels')).toBeHidden();
  await expect(page.getByTestId('custom-status')).toBeHidden();

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('custom-barcodes-sheet')).toBeHidden();
});

test('opens every documented product database URL', async ({ page }) => {
  const state = createApiState();
  await prepareApp(page, state);
  await openSettings(page);
  await page.evaluate(() => {
    const opened: string[] = [];
    Object.defineProperty(globalThis, '__OPENED_DATABASES__', { value: opened });
    globalThis.open = (url) => {
      opened.push(String(url));
      return null;
    };
  });

  const databases = [
    ['Open Food Facts', 'https://world.openfoodfacts.org/'],
    ['Open Products Facts', 'https://world.openproductsfacts.org/'],
    ['Open Beauty Facts', 'https://world.openbeautyfacts.org/'],
    ['Open Pet Food Facts', 'https://world.openpetfoodfacts.org/'],
  ] as const;
  for (const [name] of databases) await page.getByText(name, { exact: true }).click();

  const opened = await page.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          __OPENED_DATABASES__: string[];
        }
      ).__OPENED_DATABASES__,
  );
  expect(opened).toEqual(databases.map(([, url]) => url));
});
