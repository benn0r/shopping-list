import { readFileSync } from 'node:fs';
import http from 'node:http';

const index = process.argv.indexOf('--port');
const port = Number(index >= 0 ? process.argv[index + 1] : 8787);
const lists = [{ id: 'mock-list', name: 'Mock Groceries' }];
// Shopping List Cloud accounts have their own lists, so going online only sees what it created.
const cloudLists = [];
// Households (sharing): the signed-in Alex owns one; "Sam's lists" can be joined with the invite
// token "sam-invite" and then has its own session token and lists.
const samLists = [{ id: 'sam-list-0', name: "Sam's Groceries" }];
const households = {
  'house-alex': { id: 'house-alex', name: "Alex's lists", token: 'slt_cloud_mock', lists: cloudLists, pendingInvites: 0,
    members: [{ id: 'cloud-user', name: 'Alex', role: 'owner' }] },
  'house-sam': { id: 'house-sam', name: "Sam's lists", token: 'slt_cloud_sam', lists: samLists, pendingInvites: 0,
    members: [{ id: 'sam-user', name: 'Sam', role: 'owner' }] },
};
const householdFor = (authorization) => Object.values(households).find((h) => `Bearer ${h.token}` === authorization);
const memberOf = (household) => household.members.some((m) => m.id === 'cloud-user');
// Open event streams (GET /api/v1/events), like the real server's Server-Sent Events.
const streams = new Set();
let eventId = 0;
const broadcast = (event, data) => {
  for (const stream of streams) stream.write(`id: ${++eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};
// Shopping List Server returns a bundled icon name, or a generated `gen-…` icon that the app must
// load from `iconUrl`. The generated one is served from a bundled PNG that differs from the app's
// own match for "Bread" (cornbread), so screenshots show which one won.
// "Kombucha" pretends to be generated: it reports iconStatus "pending" for a few seconds after it
// is added, then "ready", so the app's sparkle and crossfade can be tested.
const serverIcons = {
  bread: { icon: 'gen-sourdough', category: 'bakery' },
  kombucha: { icon: 'gen-kombucha', category: 'beverages', generateMs: Number(process.env.MOCK_GENERATE_MS ?? 4000) },
  // Unknown to the app's own catalog, so it moves from "Other" to Beverages once its icon is ready.
  zaubertrank: { icon: 'gen-kombucha', category: 'beverages', generateMs: Number(process.env.MOCK_GENERATE_MS ?? 4000) },
};
const generatedIcons = {
  'gen-sourdough': new URL('../assets/food-icons/pancakes.png', import.meta.url),
  'gen-kombucha': new URL('../assets/food-icons/energy_drink.png', import.meta.url),
};
let items = [{ id: 'remote-bread', shoppingListId: 'mock-list', checked: false, note: 'Bread', quantity: 2, unit: { name: 'loaves' }, extras: {} }];

const json = (res, value, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(value));
};
const body = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  console.log(`${req.method} ${url.pathname}`);
  if (url.pathname === '/health') return json(res, { ok: true });
  if (url.pathname.endsWith('/bringauth')) return json(res, { uuid: 'mock-user', access_token: 'mock-token' });
  if (url.pathname.includes('/bringusers/') && url.pathname.endsWith('/lists')) return json(res, { lists: lists.map(({ id, name }) => ({ listUuid: id, name })) });
  if (url.pathname === '/rest/v2/bringlists/mock-list' && req.method === 'GET') return json(res, { purchase: items.filter((item) => !item.checked).map((item) => ({ uuid: item.id, name: item.note, specification: '' })) });
  if (url.pathname === '/rest/v2/bringlists/mock-list' && req.method === 'PUT') { const form = new URLSearchParams(await body(req)); const item = { id: `bring-${Date.now()}`, shoppingListId: 'mock-list', checked: false, note: form.get('purchase') || 'Item', quantity: 1, extras: {} }; items.push(item); return json(res, item); }
  if (url.pathname === '/rest/v2/bringlists/mock-list/items' && req.method === 'PUT') { const value = JSON.parse(await body(req)); const item = items.find((candidate) => candidate.id === value.uuid || candidate.note === value.uuid); if (item) item.checked = true; return json(res, {}); }
  if (url.pathname === '/api/households/shopping/lists') return json(res, { items: lists });
  if (url.pathname === '/api/households/shopping/items' && req.method === 'GET') return json(res, { items });
  if (url.pathname === '/api/households/shopping/items' && req.method === 'POST') { const value = JSON.parse(await body(req)); const item = { ...value, id: `mealie-${Date.now()}` }; items.push(item); return json(res, item, 201); }
  const match = url.pathname.match(/^\/api\/households\/shopping\/items\/([^/]+)$/);
  if (match && req.method === 'GET') return json(res, items.find((item) => item.id === match[1]) || {}, items.some((item) => item.id === match[1]) ? 200 : 404);
  if (match && req.method === 'PUT') { const value = JSON.parse(await body(req)); const idx = items.findIndex((item) => item.id === match[1]); if (idx >= 0) items[idx] = value; return json(res, value); }
  const generated = url.pathname.match(/^\/static\/icons\/(gen-[a-z0-9-]+)\.png$/);
  if (generated && generatedIcons[generated[1]]) { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(readFileSync(generatedIcons[generated[1]])); }
  if (url.pathname === '/api/v1/auth/apple' && req.method === 'POST') {
    // Shopping List Cloud: the real server verifies Apple's identity token; the mock accepts the
    // debug build's fixed mock credential only.
    const value = JSON.parse(await body(req));
    if (value.identityToken !== 'mock-identity-token') return json(res, { error: 'unauthorized', message: 'Invalid Apple identity token.' }, 401);
    return json(res, { token: 'slt_cloud_mock', user: { id: 'cloud-user', name: value.givenName ?? null } });
  }
  if (url.pathname.startsWith('/api/v1/')) {
    if (!['Bearer slt_mock', 'Bearer slt_cloud_mock', 'Bearer slt_cloud_sam'].includes(req.headers.authorization)) return json(res, { error: 'unauthorized', message: 'Invalid API token.' }, 401);
    const serverItem = (item) => {
      const match = serverIcons[item.note?.toLowerCase()];
      const base = { id: item.id, listId: item.shoppingListId, label: item.note, quantity: item.quantity ?? null, unit: item.unit?.name ?? null, barcode: item.extras?.barcode ?? null, note: null, checked: item.checked };
      if (item.iconReadyAt && Date.now() < item.iconReadyAt) return { ...base, icon: null, iconUrl: null, category: null, iconStatus: 'pending' };
      const iconUrl = match ? `http://${req.headers.host}/static/icons/${match.icon}.png` : null;
      return { ...base, icon: match?.icon ?? null, iconUrl, category: match?.category ?? null, iconStatus: match ? 'ready' : 'none' };
    };
    const household = householdFor(req.headers.authorization);
    const summary = (h) => ({ id: h.id, name: h.name, role: h.members.find((m) => m.id === 'cloud-user')?.role ?? 'member' });
    const session = (h) => ({ token: h.token, household: summary(h) });
    if (household && url.pathname === '/api/v1/household' && req.method === 'GET') {
      return json(res, { ...summary(household), pendingInvites: household.pendingInvites,
        members: household.members.map((m) => ({ ...m, you: m.id === 'cloud-user' })) });
    }
    if (household && url.pathname === '/api/v1/households') {
      return json(res, { items: Object.values(households).filter(memberOf).map((h) => ({ ...summary(h), current: h === household })) });
    }
    if (household && url.pathname === '/api/v1/household/invites' && req.method === 'POST') {
      household.pendingInvites += 1;
      return json(res, { url: `http://${req.headers.host}/app/invite/mock-${household.pendingInvites}`, expiresAt: '2030-01-01T00:00:00Z' }, 201);
    }
    if (household && url.pathname === '/api/v1/household/invites' && req.method === 'DELETE') { household.pendingInvites = 0; res.writeHead(204); return res.end(); }
    const memberPath = url.pathname.match(/^\/api\/v1\/household\/members\/([^/]+)$/);
    if (household && memberPath && req.method === 'DELETE') {
      const owners = household.members.filter((m) => m.role === 'owner');
      if (owners.length === 1 && owners[0].id === memberPath[1]) return json(res, { error: 'conflict', message: 'The last owner cannot leave.' }, 409);
      household.members = household.members.filter((m) => m.id !== memberPath[1]);
      res.writeHead(204); return res.end();
    }
    const sessionPath = url.pathname.match(/^\/api\/v1\/households\/([^/]+)\/session$/);
    if (household && sessionPath && req.method === 'POST') {
      const target = households[sessionPath[1]];
      if (!target || !memberOf(target)) return json(res, { error: 'not_found', message: 'Household not found.' }, 404);
      return json(res, session(target), 201);
    }
    // Invitations travel in the body (POST /invites/lookup and /invites/accept), like the server.
    if (household && ['/api/v1/invites/lookup', '/api/v1/invites/accept'].includes(url.pathname) && req.method === 'POST') {
      const invite = String(JSON.parse(await body(req)).invite ?? '').split('/').pop();
      if (invite !== 'sam-invite') return json(res, { error: 'not_found', message: 'Invite not found.' }, 404);
      const sam = households['house-sam'];
      if (url.pathname.endsWith('/lookup')) return json(res, { household: { name: sam.name }, member: memberOf(sam) });
      if (!memberOf(sam)) sam.members.push({ id: 'cloud-user', name: 'Alex', role: 'member' });
      return json(res, session(sam), 201);
    }
    // Test hook: someone joins Alex's household.
    if (url.pathname === '/api/v1/mock/member-joined' && req.method === 'POST') {
      const alex = households['house-alex'];
      if (!alex.members.some((m) => m.id === 'jo-user')) alex.members.push({ id: 'jo-user', name: 'Jo', role: 'member' });
      return json(res, {}, 201);
    }
    if (url.pathname === '/api/v1/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' });
      res.write(`retry: 5000\n\nid: ${++eventId}\nevent: ready\ndata: {"tenantId":"mock"}\n\n`);
      streams.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); streams.delete(res); });
      return;
    }
    // Test hook: another device adds an item, which only reaches the app through the stream.
    if (url.pathname === '/api/v1/mock/remote-item' && req.method === 'POST') {
      const value = JSON.parse(await body(req));
      const list = cloudLists[0] ?? lists[0];
      const item = { id: `remote-${Date.now()}`, shoppingListId: list.id, checked: false, note: value.label, extras: {} };
      items.push(item);
      broadcast('item.created', { item: serverItem(item) });
      return json(res, serverItem(item), 201);
    }
    if (url.pathname === '/api/v1/me' && req.method === 'DELETE') { res.writeHead(204); return res.end(); }
    if (url.pathname === '/api/v1/me') return json(res, { user: { name: 'Mock' } });
    const accountLists = household ? household.lists : lists;
    if (url.pathname === '/api/v1/lists' && req.method === 'POST') { const value = JSON.parse(await body(req)); const list = { id: `cloud-list-${accountLists.length}`, name: value.name || 'List' }; accountLists.push(list); return json(res, list, 201); }
    if (url.pathname === '/api/v1/lists') return json(res, { items: accountLists.map((list) => ({ ...list, openItems: items.filter((item) => item.shoppingListId === list.id && !item.checked).length, checkedItems: 0 })) });
    const listItems = url.pathname.match(/^\/api\/v1\/lists\/([^/]+)\/items$/);
    if (listItems && !accountLists.some((list) => list.id === listItems[1])) return json(res, { error: 'not_found', message: 'List not found.' }, 404);
    if (listItems && req.method === 'GET') return json(res, { items: items.filter((item) => item.shoppingListId === listItems[1] && (url.searchParams.get('filter') !== 'open' || !item.checked)).map(serverItem) });
    if (listItems && req.method === 'POST') { const value = JSON.parse(await body(req)); const item = { id: `server-${Date.now()}-${items.length}`, shoppingListId: listItems[1], checked: false, note: value.label, quantity: value.quantity ?? null, unit: value.unit ? { name: value.unit } : undefined, extras: { barcode: value.barcode } }; const generateMs = serverIcons[value.label?.toLowerCase()]?.generateMs; if (generateMs) item.iconReadyAt = Date.now() + generateMs; items.push(item); broadcast('item.created', { item: serverItem(item) }); return json(res, serverItem(item), 201); }
    const itemMatch = url.pathname.match(/^\/api\/v1\/items\/([^/]+)$/);
    const item = itemMatch && items.find((candidate) => candidate.id === itemMatch[1]);
    if (itemMatch && req.method === 'PATCH') { if (!item) return json(res, { error: 'not_found', message: 'Item not found.' }, 404); Object.assign(item, { checked: JSON.parse(await body(req)).checked ?? item.checked }); return json(res, serverItem(item)); }
  }
  return json(res, { error: 'not found' }, 404);
}).listen(port, '127.0.0.1', () => console.log(`Mock providers listening on ${port}`));
