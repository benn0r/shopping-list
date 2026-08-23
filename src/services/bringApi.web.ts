import { BringItem, BringList, Credentials } from '../types';
import {
  createItemBody,
  createLoginBody,
  createRemoveBody,
  normalizeItems,
  normalizeLists,
} from './bringPayloads';

const API_URL = '/__e2e__/bring/';
type Session = { userUuid: string; token: string };

function ensureBrowserTest(credentials: Credentials) {
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (
    process.env.EXPO_PUBLIC_E2E !== '1' ||
    !loopbackHosts.has(globalThis.location.hostname) ||
    !credentials.email.trim().toLowerCase().endsWith('.example')
  ) {
    throw new Error('The browser test API only accepts fantasy accounts on a loopback host.');
  }
}

async function checkedJson(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new Error(body.message || fallback);
  return body;
}

async function login(credentials: Credentials): Promise<Session> {
  ensureBrowserTest(credentials);
  const response = await fetch(`${API_URL}auth`, {
    method: 'POST',
    body: createLoginBody(credentials),
  });
  const body = await checkedJson(response, 'Browser test sign-in failed.');
  if (!body.uuid || !body.access_token) throw new Error('Browser test sign-in was incomplete.');
  return { userUuid: body.uuid, token: body.access_token };
}

function headers(session: Session) {
  return {
    'X-E2E-USER-UUID': session.userUuid,
    Authorization: `Bearer ${session.token}`,
  };
}

export async function loadLists(credentials: Credentials): Promise<BringList[]> {
  const session = await login(credentials);
  const response = await fetch(`${API_URL}users/${session.userUuid}/lists`, {
    headers: headers(session),
  });
  const body = await checkedJson(response, 'Could not load browser test lists.');
  return normalizeLists(body);
}

export async function addItem(
  credentials: Credentials,
  listUuid: string,
  label: string,
  quantity?: number,
  barcode?: string,
) {
  const session = await login(credentials);
  const body = createItemBody(label, quantity, barcode);
  const response = await fetch(`${API_URL}lists/${encodeURIComponent(listUuid)}`, {
    method: 'PUT',
    headers: {
      ...headers(session),
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: body.toString(),
  });
  if (!response.ok) throw new Error('Browser test list update failed.');
}

export async function loadItems(credentials: Credentials, listUuid: string): Promise<BringItem[]> {
  const session = await login(credentials);
  const response = await fetch(`${API_URL}lists/${encodeURIComponent(listUuid)}`, {
    headers: headers(session),
  });
  return normalizeItems(await checkedJson(response, 'Could not load browser test items.'));
}

export async function removeItem(
  credentials: Credentials,
  listUuid: string,
  item: BringItem,
): Promise<void> {
  const session = await login(credentials);
  const response = await fetch(`${API_URL}lists/${encodeURIComponent(listUuid)}/items`, {
    method: 'PUT',
    headers: { ...headers(session), 'Content-Type': 'application/json' },
    body: JSON.stringify(createRemoveBody(item)),
  });
  if (!response.ok) throw new Error('Browser test list removal failed.');
}
