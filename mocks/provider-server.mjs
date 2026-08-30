import http from 'node:http';

const index = process.argv.indexOf('--port');
const port = Number(index >= 0 ? process.argv[index + 1] : 8787);
const lists = [{ id: 'mock-list', name: 'Mock Groceries' }];
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
  return json(res, { error: 'not found' }, 404);
}).listen(port, '127.0.0.1', () => console.log(`Mock providers listening on ${port}`));
