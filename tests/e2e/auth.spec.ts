import { expect, test } from '@playwright/test';
import { createApiState, FANTASY_ACCOUNT, FANTASY_LISTS, prepareApp, signIn } from './support';

test('requires a valid Bring sign-in and keeps the modal mandatory', async ({ page }) => {
  const state = createApiState();
  await prepareApp(page, state);

  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByTestId('login-status')).toContainText(
    'Enter your Bring email and password.',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('login-sheet')).toBeVisible();

  await page.getByLabel('Email').fill('traveler@orbit.invalid');
  await expect(page.getByTestId('login-status')).toBeHidden();
  await page.getByLabel('Password').fill('synthetic-password');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByTestId('login-status')).toContainText('Could not connect to Bring.');
  expect(state.loginBodies).toEqual([]);

  state.authFailure = 'http';
  await page.getByLabel('Email').fill(FANTASY_ACCOUNT.email);
  await page.getByLabel('Password').fill('wrong-fantasy-password');
  await expect(page.getByTestId('login-status')).toBeHidden();
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect.poll(() => state.loginBodies.length).toBe(1);
  await expect(page.getByTestId('login-status')).toContainText('Could not connect to Bring.');
  await expect(page.getByTestId('login-sheet')).toBeVisible();
});

test('handles list and network failures without losing the login form', async ({ page }) => {
  const state = createApiState();
  state.listFailure = 'http';
  await prepareApp(page, state);

  await page.getByLabel('Email').fill(FANTASY_ACCOUNT.email);
  await page.getByLabel('Password').fill(FANTASY_ACCOUNT.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByTestId('login-status')).toContainText('Could not connect to Bring.');
  expect(state.loginBodies).toHaveLength(1);

  state.listFailure = null;
  state.authFailure = 'network';
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect.poll(() => state.loginBodies.length).toBe(2);
  await expect(page.getByTestId('login-status')).toContainText('Could not connect to Bring.');
  await expect(page.getByLabel('Email')).toHaveValue(FANTASY_ACCOUNT.email);
});

test('persists a fantasy session, then logout clears the account and list', async ({ page }) => {
  const state = createApiState();
  await prepareApp(page, state);
  await signIn(page);

  expect(state.loginBodies.at(-1)?.get('email')).toBe(FANTASY_ACCOUNT.email);
  expect(state.loginBodies.at(-1)?.get('password')).toBe(FANTASY_ACCOUNT.password);
  await page.getByTestId('tab-settings').click();
  await expect(page.getByText(FANTASY_ACCOUNT.email)).toBeVisible();
  await page.getByTestId(`bring-map-groceries-${FANTASY_LISTS[0].listUuid}`).click();
  await expect(
    page.getByTestId(`bring-map-groceries-${FANTASY_LISTS[0].listUuid}`),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('settings-status')).toContainText(
    `${FANTASY_LISTS[0].name} selected.`,
  );

  await page.reload();
  await expect(page.getByTestId('login-sheet')).toBeHidden();
  await page.getByTestId('tab-settings').click();
  await expect(
    page.getByTestId(`bring-map-groceries-${FANTASY_LISTS[0].listUuid}`),
  ).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: 'Log Out' }).click();
  await expect(page.getByTestId('login-sheet')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('login-sheet')).toBeVisible();
});
