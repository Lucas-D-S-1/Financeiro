import { randomUUID } from 'node:crypto';

const json = (data, status = 200, headers) => Response.json(data, { status, headers });
const page = (results) => ({ page: 1, total: results.length, totalPages: results.length ? 1 : 0, results });

export function syntheticProvider() {
  const users = new Map();
  const audit = { auth: 0, paths: [], tokens: [] };
  const faults = new Map();
  function add(user, name, overrides = {}) {
    const id = randomUUID();
    const accountId = randomUUID();
    const txId = randomUUID();
    const billId = randomUUID();
    const today = new Date().toISOString().slice(0, 10);
    const value = {
      item: {
        id, clientUserId: user, status: 'UPDATED', executionStatus: 'SUCCESS',
        connector: { id: 2, isSandbox: true, name }, ...overrides,
      },
      account: { id: accountId, itemId: id, name: 'Cartão sintético', type: 'CREDIT', balance: 200, currencyCode: 'BRL' },
      tx: [
        { id: txId, accountId, description: 'Movimento sintético', date: today, amount: 20 },
        { id: randomUUID(), accountId, description: 'Movimento na segunda página', date: today, amount: 30 },
      ],
      bills: [{ id: billId, accountId, dueDate: today, totalAmount: 150, totalAmountCurrencyCode: 'BRL' }],
    };
    users.set(id, value);
    return value;
  }

  function fetcher(url, { method, body }) {
    audit.paths.push(url.pathname);
    if (faults.has(url.pathname)) {
      const [status, headers] = faults.get(url.pathname);
      return json({}, status, headers);
    }
    if (url.pathname === '/auth') {
      audit.auth++;
      return json({ apiKey: randomUUID() });
    }
    if (url.pathname === '/connectors') {
      return json(page([
        { id: 2, name: 'Pluggy Bank', isSandbox: true },
        { id: 601, name: 'Instituição real', isSandbox: false, isOpenFinance: true, type: 'PERSONAL_BANK' },
      ]));
    }
    if (url.pathname === '/connect_token') {
      audit.tokens.push(JSON.parse(body));
      return json({ accessToken: randomUUID() });
    }
    if (url.pathname.startsWith('/items/')) {
      const id = url.pathname.split('/').at(-1);
      if (!users.has(id)) return json({}, 404);
      if (method === 'DELETE') {
        users.delete(id);
        return new Response(null, { status: 204 });
      }
      return json(users.get(id).item);
    }
    if (url.pathname === '/accounts') {
      const item = users.get(url.searchParams.get('itemId'));
      return json(page(item?.account ? [item.account] : []));
    }
    const item = [...users.values()].find((entry) => entry.account?.id === url.searchParams.get('accountId'));
    if (url.pathname === '/bills') return json(page(item?.bills ?? []));
    if (url.pathname === '/v2/transactions') {
      const rows = item?.tx ?? [];
      if (rows.length > 1 && !url.searchParams.has('after')) {
        return json({ results: rows.slice(0, 1), next: '?after=second-page' });
      }
      return json({ results: url.searchParams.has('after') ? rows.slice(1) : rows, next: null });
    }
    return json({}, 404);
  }

  return { users, audit, faults, add, fetcher };
}
