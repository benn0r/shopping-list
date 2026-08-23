import { BringItem, BringList, Credentials } from '../types';
import {
  createItemBody,
  createLoginBody,
  createRemoveBody,
  createRestoreByLabelBody,
  createRestoreBody,
  normalizeItems,
  normalizeLists,
} from './bringPayloads';

const API_URL = 'https://api.getbring.com/rest/v2/';
type Session = {
  userUuid: string;
  token: string;
  publicUserUuid?: string;
  tokenType?: string;
};

function apiKey() {
  const value = process.env.EXPO_PUBLIC_BRING_API_KEY;
  if (!value)
    throw new Error(
      'Shopping List is missing EXPO_PUBLIC_BRING_API_KEY. Add it to your local or build environment.',
    );
  return value;
}

async function checkedJson(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new Error(body.message || fallback);
  return body;
}

export async function login(credentials: Credentials): Promise<Session> {
  const response = await fetch(`${API_URL}bringauth`, {
    method: 'POST',
    body: createLoginBody(credentials),
  });
  const body = await checkedJson(response, 'Bring sign-in failed. Check your credentials.');
  if (!body.uuid || !body.access_token)
    throw new Error('Bring returned an incomplete sign-in response.');
  return {
    userUuid: body.uuid,
    token: body.access_token,
    ...(body.publicUuid ? { publicUserUuid: body.publicUuid } : {}),
    ...(body.token_type ? { tokenType: body.token_type } : {}),
  };
}

function headers(session: Session) {
  return {
    'X-BRING-API-KEY': apiKey(),
    'X-BRING-CLIENT': 'android',
    'X-BRING-APPLICATION': 'bring',
    'X-BRING-COUNTRY': 'CH',
    'X-BRING-USER-UUID': session.userUuid,
    ...(session.publicUserUuid ? { 'X-BRING-PUBLIC-USER-UUID': session.publicUserUuid } : {}),
    Accept: 'application/json',
    Authorization: `${session.tokenType || 'Bearer'} ${session.token}`,
  };
}

export async function loadLists(credentials: Credentials): Promise<BringList[]> {
  const session = await login(credentials);
  const response = await fetch(`${API_URL}bringusers/${session.userUuid}/lists`, {
    headers: headers(session),
  });
  const body = await checkedJson(response, 'Could not load Bring lists.');
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
  const response = await fetch(`${API_URL}bringlists/${encodeURIComponent(listUuid)}`, {
    method: 'PUT',
    headers: {
      ...headers(session),
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: body.toString(),
  });
  if (!response.ok) throw new Error('Bring did not accept the item. Please try again.');
}

export async function restoreItem(
  credentials: Credentials,
  listUuid: string,
  item: Omit<BringItem, 'uuid'> & { uuid?: string },
) {
  const session = await login(credentials);
  const response = await fetch(`${API_URL}bringlists/${encodeURIComponent(listUuid)}/items`, {
    method: 'PUT',
    headers: { ...headers(session), 'Content-Type': 'application/json' },
    body: JSON.stringify(
      item.uuid ? createRestoreBody(item as BringItem) : createRestoreByLabelBody(item),
    ),
  });
  if (!response.ok) throw new Error('Bring did not restore the item. Please try again.');
}

export async function loadItems(credentials: Credentials, listUuid: string): Promise<BringItem[]> {
  const session = await login(credentials);
  const response = await fetch(`${API_URL}bringlists/${encodeURIComponent(listUuid)}`, {
    headers: headers(session),
  });
  return normalizeItems(await checkedJson(response, 'Could not load Bring items.'));
}

export async function removeItem(
  credentials: Credentials,
  listUuid: string,
  item: BringItem,
): Promise<void> {
  const session = await login(credentials);
  const response = await fetch(`${API_URL}bringlists/${encodeURIComponent(listUuid)}/items`, {
    method: 'PUT',
    headers: { ...headers(session), 'Content-Type': 'application/json' },
    body: JSON.stringify(createRemoveBody(item)),
  });
  if (!response.ok) throw new Error('Bring did not remove the item. Please try again.');
}
