import { expect, test } from '@playwright/test';
import {
  createApiState,
  FANTASY_ACCOUNT,
  FANTASY_LISTS,
  prepareApp,
  selectProviderList,
  signIn,
} from './support';

test('validates Bring credentials in inline settings', async ({ page }) => {
  const state = createApiState();
  await prepareApp(page, state);

  await page.getByRole('button', { name: 'Connect Bring' }).click();
  await expect(page.getByTestId('settings-status')).toContainText(
    'Enter your Bring email and password.',
  );

  await page.getByLabel('Email').fill('traveler@orbit.invalid');
  await expect(page.getByTestId('settings-status')).toBeHidden();
  await page.getByLabel('Password').fill('synthetic-password');
  await page.getByRole('button', { name: 'Connect Bring' }).click();
  await expect(page.getByTestId('settings-status')).toContainText('Could not connect to Bring.');
  expect(state.loginBodies).toEqual([]);

  state.authFailure = 'http';
  await page.getByLabel('Email').fill(FANTASY_ACCOUNT.email);
  await page.getByLabel('Password').fill('wrong-fantasy-password');
  await expect(page.getByTestId('settings-status')).toBeHidden();
  await page.getByRole('button', { name: 'Connect Bring' }).click();
  await expect.poll(() => state.loginBodies.length).toBe(1);
  await expect(page.getByTestId('settings-status')).toContainText('Could not connect to Bring.');
});

test('handles list and network failures without losing the login form', async ({ page }) => {
  const state = createApiState();
  state.listFailure = 'http';
  await prepareApp(page, state);

  await page.getByLabel('Email').fill(FANTASY_ACCOUNT.email);
  await page.getByLabel('Password').fill(FANTASY_ACCOUNT.password);
  await page.getByRole('button', { name: 'Connect Bring' }).click();
  await expect(page.getByTestId('settings-status')).toContainText('Could not connect to Bring.');
  expect(state.loginBodies).toHaveLength(1);

  state.listFailure = null;
  state.authFailure = 'network';
  await page.getByRole('button', { name: 'Connect Bring' }).click();
  await expect.poll(() => state.loginBodies.length).toBe(2);
  await expect(page.getByTestId('settings-status')).toContainText('Could not connect to Bring.');
  await expect(page.getByLabel('Email')).toHaveValue(FANTASY_ACCOUNT.email);
});

test('persists a fantasy session, then logout clears the account and list', async ({ page }) => {
  const state = createApiState();
  await prepareApp(page, state);
  await signIn(page);

  expect(state.loginBodies.at(-1)?.get('email')).toBe(FANTASY_ACCOUNT.email);
  expect(state.loginBodies.at(-1)?.get('password')).toBe(FANTASY_ACCOUNT.password);
  await page.getByTestId('tab-settings').click();
  await expect(page.getByLabel('Email')).toHaveValue(FANTASY_ACCOUNT.email);
  await selectProviderList(page);
  await expect(page.getByTestId('list-editor-groceries')).toContainText(FANTASY_LISTS[0].name);

  await page.reload();
  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('list-editor-groceries')).toContainText(FANTASY_LISTS[0].name);

  await page.getByRole('button', { name: 'Disconnect Bring' }).click();
  await expect(page.getByLabel('Email')).toBeHidden();
  await page.reload();
  await page.getByTestId('tab-settings').click();
  await expect(page.getByLabel('Email')).toBeHidden();
});
