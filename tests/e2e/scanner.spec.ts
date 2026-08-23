import { expect, test } from '@playwright/test';
import {
  createApiState,
  emitBarcodeBatch,
  FANTASY_LISTS,
  prepareApp,
  product,
  signIn,
  signInAndSelectList,
} from './support';

test('requests camera access and activates the browser camera after approval', async ({ page }) => {
  const state = createApiState();
  await prepareApp(page, state, 'prompt');
  await signIn(page);

  await expect(page.getByRole('button', { name: 'Allow Camera Access' })).toBeVisible();
  await page.getByRole('button', { name: 'Allow Camera Access' }).click();
  const video = page.locator('video');
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.videoWidth))
    .toBeGreaterThan(0);
});

test('selects the barcode centered in the scan frame', async ({ page }) => {
  const state = createApiState();
  const top = '7611111111111';
  const left = '7600000000000';
  const centered = '7622222222222';
  state.products[top] = product('Top Shelf Soda');
  state.products[left] = product('Left Shelf Soda');
  state.products[centered] = product('Centered Soda');
  await prepareApp(page, state);
  await signInAndSelectList(page);

  await emitBarcodeBatch(page, [
    { value: top, position: 'top' },
    { value: left, position: 'left' },
    { value: centered, position: 'center' },
  ]);

  await expect(page.getByTestId('product-sheet')).toBeVisible();
  await expect(
    page.getByTestId('product-sheet').getByText('Centered Soda, 330 ml', { exact: true }),
  ).toBeVisible();
  expect(state.productRequests).toEqual([centered]);
});

test('disables adding until a list is selected and resumes scanning after cancel', async ({
  page,
}) => {
  const state = createApiState();
  const first = '7601010101010';
  const second = '7602020202020';
  state.products[first] = product('Unconfigured Soda');
  state.products[second] = product('Second Chance Soda');
  await prepareApp(page, state);
  await signIn(page);

  await expect(page.getByTestId('scanner-status')).toContainText(
    'Connect Bring and choose a shopping list in Settings.',
  );
  await emitBarcodeBatch(page, [{ value: first }]);
  await expect(page.getByTestId('product-sheet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add and Sync to Bring' })).toBeDisabled();
  await expect(
    page.getByText('Configure a shopping list in Settings before adding this item.', {
      exact: true,
    }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('product-sheet')).toBeHidden();
  await emitBarcodeBatch(page, [{ value: second }]);
  await expect(
    page.getByTestId('product-sheet').getByText('Second Chance Soda, 330 ml', { exact: true }),
  ).toBeVisible();
  expect(state.productRequests).toEqual([first, second]);
  expect(state.addedItems).toEqual([]);
});

test('uses the selected product language and generic Bring label', async ({ page }) => {
  const state = createApiState();
  const barcode = '7603030303030';
  state.products[barcode] = {
    kind: 'product',
    product: {
      product_name_en: 'Moon Surface Cleaner',
      generic_name_en: 'Surface cleaner',
      product_name_fr: 'Nettoyant lunaire',
      generic_name_fr: 'Nettoyant ménager',
      brands: 'Orbital Goods',
      quantity: '750 ml',
      product_type: 'product',
    },
  };
  await prepareApp(page, state);
  await signIn(page);
  await page.getByTestId('tab-settings').click();
  await page.getByTestId(`list-${FANTASY_LISTS[0].listUuid}`).click();
  await expect(page.getByTestId('settings-status')).toContainText(
    `${FANTASY_LISTS[0].name} selected.`,
  );
  await page.getByTestId('product-language-fr').click();
  await expect(page.getByTestId('settings-status')).toContainText(
    'Product language set to French.',
  );
  await page.getByTestId('label-style-generic').click();
  await expect(page.getByTestId('settings-status')).toContainText(
    'Bring item label set to Generic.',
  );
  await page.getByTestId('tab-scan').click();

  await emitBarcodeBatch(page, [{ value: barcode }]);
  const sheet = page.getByTestId('product-sheet');
  await expect(sheet.getByText('Nettoyant lunaire, 750 ml', { exact: true })).toBeVisible();
  await expect(sheet.getByLabel('Item Label')).toHaveValue('Nettoyant ménager');
  await expect(sheet.getByText('Open Products Facts', { exact: true })).toBeVisible();
  expect(state.productRequests).toEqual([barcode]);
  expect(state.productRequestLanguages).toEqual(['fr']);
});

test('adds an edited item with quantity and never sends the barcode to Bring', async ({ page }) => {
  const state = createApiState();
  const barcode = '7633333333333';
  state.products[barcode] = product('Comet Cola');
  await prepareApp(page, state);
  await signInAndSelectList(page);
  const cameraBeforeAdd = await page.getByTestId('scanner-camera-wrap').boundingBox();
  expect(cameraBeforeAdd).not.toBeNull();

  await emitBarcodeBatch(page, [{ value: barcode }]);
  await expect(page.getByTestId('product-sheet')).toBeVisible();
  await page.getByLabel('Item Label').fill('Party Cola');
  await page.getByRole('button', { name: 'Increase quantity' }).click();
  await page.getByRole('button', { name: 'Increase quantity' }).click();
  await expect(page.getByRole('textbox', { name: 'Quantity', exact: true })).toHaveValue('2');
  await page.getByRole('button', { name: 'Add and Sync to Bring' }).click();

  await expect(page.getByTestId('product-sheet')).toBeHidden();
  const status = page.getByTestId('scanner-status');
  await expect(status).toContainText('Party Cola added locally and synced to Bring.');
  await expect(status).toHaveCSS('position', 'absolute');
  await expect(status).toHaveCSS('bottom', '12px');
  const cameraAfterAdd = await page.getByTestId('scanner-camera-wrap').boundingBox();
  expect(cameraAfterAdd).not.toBeNull();
  expect(cameraAfterAdd?.y).toBe(cameraBeforeAdd?.y);
  await expect(page.getByText('2× Party Cola', { exact: true })).toBeVisible();
  expect(state.addedListUuids).toEqual([FANTASY_LISTS[0].listUuid]);
  expect(state.addedItems).toHaveLength(1);
  expect(state.addedItems[0].get('purchase')).toBe('Party Cola');
  expect(state.addedItems[0].get('specification')).toBe('2×');
  expect(state.addedItems[0].toString()).not.toContain(barcode);
  expect(state.addedItems[0].has('barcode')).toBe(false);
  expect(state.addedItems[0].has('ean')).toBe(false);
  await expect(status).toBeHidden({ timeout: 5_000 });
});

test('omits an unselected quantity and restores scan history after reload', async ({ page }) => {
  const state = createApiState();
  const barcode = '7604040404040';
  state.products[barcode] = product('Solo Soda');
  await prepareApp(page, state);
  await signInAndSelectList(page);

  await emitBarcodeBatch(page, [{ value: barcode }]);
  const sheet = page.getByTestId('product-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('textbox', { name: 'Quantity', exact: true })).toHaveValue('');
  await sheet.getByLabel('Item Label').fill('Single Bottle');
  await sheet.getByRole('button', { name: 'Add and Sync to Bring' }).click();

  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('scanner-status')).toContainText(
    'Single Bottle added locally and synced to Bring.',
  );
  expect(state.addedItems).toHaveLength(1);
  expect(state.addedItems[0].get('purchase')).toBe('Single Bottle');
  expect(state.addedItems[0].get('specification')).toBe('');

  await page.reload();
  await expect(page.getByTestId('login-sheet')).toBeHidden();
  await expect(page.getByText('Shopping List', { exact: true })).toBeVisible();
  await expect(page.getByText('Single Bottle', { exact: true })).toBeVisible();
  await expect(page.getByText('Orbital Goods', { exact: true })).toBeVisible();
});

test('uses a custom barcode without contacting an online product database', async ({ page }) => {
  const state = createApiState();
  const barcode = '7644444444444';
  await prepareApp(page, state);
  await signIn(page);
  await page.getByTestId('tab-settings').click();
  await page.getByTestId(`list-${FANTASY_LISTS[0].listUuid}`).click();
  await page.getByTestId('custom-barcodes-open').click();
  await page.getByLabel('Barcode', { exact: true }).fill(barcode);
  await page.getByLabel('Bring Label').fill('Orbit Tissue');
  await page.getByRole('button', { name: 'Save Custom Barcode' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByTestId('tab-scan').click();

  await emitBarcodeBatch(page, [{ value: barcode }]);
  await expect(page.getByTestId('product-sheet')).toBeVisible();
  await expect(page.getByText('Orbit Tissue', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Custom label', { exact: true })).toBeVisible();
  expect(state.productRequests).toEqual([]);
});

test('shows not-found and resumes scanning the next product', async ({ page }) => {
  const state = createApiState();
  const missing = '7655555555555';
  const found = '7666666666666';
  state.products[missing] = { kind: 'not-found' };
  state.products[found] = product('Recovery Soda');
  await prepareApp(page, state);
  await signInAndSelectList(page);

  await emitBarcodeBatch(page, [{ value: missing }]);
  await expect(page.getByTestId('scanner-status')).toContainText('Product not found.');
  await emitBarcodeBatch(page, [{ value: found }]);
  await expect(
    page.getByTestId('product-sheet').getByText('Recovery Soda, 330 ml', { exact: true }),
  ).toBeVisible();
  expect(state.productRequests).toEqual([missing, found]);
});

for (const [name, reply] of [
  ['HTTP', { kind: 'http-error' }],
  ['network', { kind: 'network-error' }],
  ['invalid JSON', { kind: 'invalid-json' }],
  ['empty response', { kind: 'empty' }],
] as const) {
  test(`handles a product database ${name} error`, async ({ page }) => {
    const state = createApiState();
    const barcode = '7677777777777';
    state.products[barcode] = reply;
    await prepareApp(page, state);
    await signInAndSelectList(page);

    await emitBarcodeBatch(page, [{ value: barcode }]);
    await expect(page.getByTestId('scanner-status')).toContainText(
      name === 'empty response' ? 'Product not found.' : 'Product lookup failed.',
    );
    await expect(page.getByTestId('product-sheet')).toBeHidden();
  });
}

test('keeps the product sheet open after a Bring error and allows retry', async ({ page }) => {
  const state = createApiState();
  const barcode = '7688888888888';
  state.products[barcode] = product('Retry Soda');
  state.addFailure = 'http';
  await prepareApp(page, state);
  await signInAndSelectList(page);

  await emitBarcodeBatch(page, [{ value: barcode }]);
  await page.getByRole('button', { name: 'Add and Sync to Bring' }).click();
  await expect(page.getByTestId('product-status')).toContainText('Could not add the item.');
  await expect(page.getByTestId('product-sheet')).toBeVisible();

  state.addFailure = null;
  await page.getByRole('button', { name: 'Add and Sync to Bring' }).click();
  await expect(page.getByTestId('product-sheet')).toBeHidden();
  expect(state.addedItems).toHaveLength(2);
});

test('keeps the scanner fixed while scrolling and follows system appearance', async ({ page }) => {
  const state = createApiState();
  await prepareApp(page, state);
  await signInAndSelectList(page);
  const camera = page.getByTestId('scanner-camera-wrap');
  const before = await camera.boundingBox();
  expect(before).not.toBeNull();
  if (!before) throw new Error('The scanner camera has no browser layout box.');
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.wheel(0, 700);
  const after = await camera.boundingBox();
  expect(after).not.toBeNull();
  if (!after) throw new Error('The scanner camera disappeared after scrolling.');
  expect(await page.evaluate(() => globalThis.scrollY)).toBe(0);
  expect(after.y).toBe(before.y);

  const scanLabel = page.getByTestId('tab-scan').getByText('Scan', { exact: true });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(scanLabel).toHaveCSS('color', 'rgb(35, 127, 120)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(scanLabel).toHaveCSS('color', 'rgb(114, 213, 202)');
});
