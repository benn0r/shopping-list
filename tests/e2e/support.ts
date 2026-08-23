import { expect, Page, Route } from '@playwright/test';

export const FANTASY_ACCOUNT = {
  email: 'pilot@moon.example',
  password: 'lunar-secret',
};

export const FANTASY_LISTS = [
  { listUuid: 'moon-base-groceries', name: 'Moon Base Groceries' },
  { listUuid: 'launch-party', name: 'Launch Party' },
];

type Failure = 'http' | 'network' | null;
type ProductReply =
  | { kind: 'product'; product: Record<string, unknown> }
  | { kind: 'not-found' }
  | { kind: 'http-error' }
  | { kind: 'network-error' }
  | { kind: 'invalid-json' }
  | { kind: 'empty' };

export type ApiState = {
  authFailure: Failure;
  listFailure: Failure;
  addFailure: Failure;
  loginBodies: URLSearchParams[];
  addedItems: URLSearchParams[];
  addedListUuids: string[];
  bringItems: { uuid: string; itemId: string; specification: string }[];
  productRequests: string[];
  productRequestLanguages: string[];
  products: Record<string, ProductReply>;
};

export function createApiState(): ApiState {
  return {
    authFailure: null,
    listFailure: null,
    addFailure: null,
    loginBodies: [],
    addedItems: [],
    addedListUuids: [],
    bringItems: [],
    productRequests: [],
    productRequestLanguages: [],
    products: {},
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:4177',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, X-BRING-API-KEY, X-BRING-CLIENT, X-BRING-CLIENT-SOURCE, X-BRING-COUNTRY, X-BRING-USER-UUID',
};

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function applyFailure(route: Route, failure: Failure, message: string) {
  if (failure === 'network') {
    await route.abort('failed');
    return true;
  }
  if (failure === 'http') {
    await json(route, 503, { error: true, message });
    return true;
  }
  return false;
}

export async function mockExternalApis(page: Page, state: ApiState) {
  await page
    .context()
    .route(/^https?:\/\/(?!127\.0\.0\.1:4177(?:\/|$))/, (route) => route.abort('blockedbyclient'));
  await page.route('http://127.0.0.1:4177/__e2e__/bring/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (url.pathname.endsWith('/auth') && request.method() === 'POST') {
      state.loginBodies.push(new URLSearchParams(request.postData() ?? ''));
      if (await applyFailure(route, state.authFailure, 'Fantasy sign-in failed.')) return;
      await json(route, 200, { uuid: 'moon-pilot', access_token: 'orbit-token' });
      return;
    }
    if (url.pathname.endsWith('/lists') && request.method() === 'GET') {
      if (await applyFailure(route, state.listFailure, 'Fantasy lists are unavailable.')) return;
      await json(route, 200, { lists: FANTASY_LISTS });
      return;
    }
    if (url.pathname.includes('/__e2e__/bring/lists/') && request.method() === 'GET') {
      await json(route, 200, { items: { purchase: state.bringItems, recently: [] } });
      return;
    }
    if (url.pathname.endsWith('/items') && request.method() === 'PUT') {
      const body = JSON.parse(request.postData() || '{}') as {
        changes?: { uuid: string; operation: string }[];
      };
      for (const change of body.changes || []) {
        if (change.operation === 'REMOVE' || change.operation === 'TO_RECENTLY') {
          state.bringItems = state.bringItems.filter((item) => item.uuid !== change.uuid);
        }
      }
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (url.pathname.includes('/__e2e__/bring/lists/') && request.method() === 'PUT') {
      state.addedItems.push(new URLSearchParams(request.postData() ?? ''));
      state.addedListUuids.push(decodeURIComponent(url.pathname.split('/').at(-1) ?? ''));
      if (await applyFailure(route, state.addFailure, 'Fantasy list update failed.')) return;
      const body = state.addedItems.at(-1)!;
      const itemId = body.get('purchase') || '';
      const existing = state.bringItems.find((item) => item.itemId === itemId);
      if (existing) existing.specification = body.get('specification') || '';
      else
        state.bringItems.push({
          uuid: `fantasy-item-${state.bringItems.length + 1}`,
          itemId,
          specification: body.get('specification') || '',
        });
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await json(route, 500, { error: true, message: 'Unexpected mocked Bring request.' });
  });

  await page.route('https://world.openfoodfacts.org/api/v3/product/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    const url = new URL(request.url());
    const barcode = url.pathname.split('/').at(-1) ?? '';
    state.productRequests.push(barcode);
    state.productRequestLanguages.push(url.searchParams.get('lc') ?? '');
    const reply = state.products[barcode] ?? { kind: 'not-found' };
    if (reply.kind === 'network-error') {
      await route.abort('failed');
      return;
    }
    if (reply.kind === 'not-found') {
      await json(route, 404, {});
      return;
    }
    if (reply.kind === 'http-error') {
      await json(route, 503, { error: 'database unavailable' });
      return;
    }
    if (reply.kind === 'invalid-json') {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: '{',
      });
      return;
    }
    await json(route, 200, reply.kind === 'empty' ? {} : { product: reply.product });
  });
}

type PermissionState = 'granted' | 'prompt' | 'denied';

export async function installCameraHarness(page: Page, permission: PermissionState = 'granted') {
  await page.addInitScript((initialPermission) => {
    type DetectedBarcode = {
      format: string;
      rawValue: string;
      boundingBox: { x: number; y: number; width: number; height: number };
      cornerPoints: { x: number; y: number }[];
    };
    const harness = { batches: [] as DetectedBarcode[][] };
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: async () => ({
          state: initialPermission,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
      },
    });
    class TestBarcodeDetector {
      async detect() {
        return harness.batches.shift() ?? [];
      }
    }
    Object.defineProperty(globalThis, 'BarcodeDetector', {
      configurable: true,
      value: TestBarcodeDetector,
    });
    Object.defineProperty(globalThis, '__SHOPPING_LIST_E2E__', {
      configurable: true,
      value: harness,
    });
  }, permission);
}

export async function prepareApp(
  page: Page,
  state: ApiState,
  permission: PermissionState = 'granted',
) {
  await installCameraHarness(page, permission);
  await mockExternalApis(page, state);
  await page.goto('/');
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('bring-sync-switch').click();
  await expect(page.getByTestId('login-sheet')).toBeVisible();
}

export async function signIn(page: Page) {
  await page.getByLabel('Email').fill(`  ${FANTASY_ACCOUNT.email}  `);
  await page.getByLabel('Password').fill(FANTASY_ACCOUNT.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByTestId('login-sheet')).toBeHidden();
  await page.getByTestId('tab-scan').click();
}

export async function signInAndSelectList(page: Page) {
  await signIn(page);
  await page.getByTestId('tab-settings').click();
  await page.getByTestId(`bring-map-groceries-${FANTASY_LISTS[0].listUuid}`).click();
  await expect(
    page.getByTestId(`bring-map-groceries-${FANTASY_LISTS[0].listUuid}`),
  ).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('tab-scan').click();
  await page.getByRole('button', { name: 'Scan Product' }).click();
  await expect(page.getByTestId('scanner-camera-wrap')).toBeVisible();
}

type BarcodePosition = 'center' | 'top' | 'left';

export async function emitBarcodeBatch(
  page: Page,
  barcodes: { value: string; position?: BarcodePosition }[],
) {
  if (!(await page.locator('video').first().isVisible())) {
    await page.getByRole('button', { name: 'Scan Product' }).click();
  }
  const video = page.locator('video').first();
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).videoWidth))
    .toBeGreaterThan(0);
  await page.evaluate((entries) => {
    const camera = document.querySelector('[data-testid="scanner-camera-wrap"]');
    const frame = document.querySelector('[data-testid="scanner-frame"]');
    const videoElement = document.querySelector('video');
    if (!camera || !frame || !(videoElement instanceof HTMLVideoElement)) {
      throw new Error('The browser camera harness is not mounted.');
    }
    const videoRect = videoElement.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    // Expo Camera 57's web coordinate mapper scales x against the rendered video height
    // and y against its width. Invert that mapping so browser detections land where the
    // visible scanner frame is drawn.
    const scaleX = videoRect.height / videoElement.videoWidth;
    const scaleY = videoElement.videoHeight / videoRect.width;
    const rawWidth = 72 / scaleX;
    const rawHeight = 36 / scaleY;
    const batch = entries.map(({ value, position = 'center' }) => {
      let clientX = frameRect.left + frameRect.width / 2;
      let clientY = frameRect.top + frameRect.height / 2;
      if (position === 'top') clientY = frameRect.top - 50;
      if (position === 'left') clientX = frameRect.left - 18;
      const centerX = (clientX - videoRect.left) / scaleX;
      const centerY = (clientY - videoRect.top) / scaleY;
      const x = centerX - rawWidth / 2;
      const y = centerY - rawHeight / 2;
      return {
        format: 'ean_13',
        rawValue: value,
        boundingBox: { x, y, width: rawWidth, height: rawHeight },
        cornerPoints: [
          { x, y },
          { x: x + rawWidth, y },
          { x: x + rawWidth, y: y + rawHeight },
          { x, y: y + rawHeight },
        ],
      };
    });
    const browserHarness = (
      globalThis as typeof globalThis & {
        __SHOPPING_LIST_E2E__: { batches: (typeof batch)[] };
      }
    ).__SHOPPING_LIST_E2E__;
    browserHarness.batches.push(batch);
  }, barcodes);
}

export function product(name: string, genericName = 'Soft drink') {
  return {
    kind: 'product' as const,
    product: {
      product_name_en: name,
      generic_name_en: genericName,
      brands: 'Orbital Goods',
      quantity: '330 ml',
      product_type: 'food',
    },
  };
}
