const ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const isId = (value) => typeof value === 'string' && ID.test(value);

export class ProviderError extends Error {
  constructor(status, retrySeconds = null) {
    super('Pluggy indisponível');
    this.status = status;
    this.retrySeconds = retrySeconds;
  }
}

function retryAfter(value) {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Math.min(2147483647, Number(value));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : null;
}

export function createProvider(config, fetcher = fetch) {
  let apiKey;
  let expires = 0;
  let authRequest;

  async function request(path, options = {}) {
    const { key, signal, body, method = 'GET' } = options;
    let response;
    try {
      response = await fetcher(new URL(path, 'https://api.pluggy.ai'), {
        method,
        redirect: 'error',
        signal: signal ?? AbortSignal.timeout(5000),
        headers: { ...(key && { 'X-API-KEY': key }), ...(body && { 'Content-Type': 'application/json' }) },
        body: body && JSON.stringify(body),
      });
      if (!response.ok) throw new ProviderError(response.status, retryAfter(response.headers.get('Retry-After')));
      if (method === 'DELETE') return null;
      return await response.json();
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(503);
    }
  }

  async function authenticate() {
    if (apiKey && Date.now() < expires) return apiKey;
    if (!authRequest) {
      authRequest = request('/auth', {
        method: 'POST', body: { clientId: config.clientId, clientSecret: config.clientSecret },
      }).then((result) => {
        if (typeof result.apiKey !== 'string' || !result.apiKey) throw new ProviderError(502);
        apiKey = result.apiKey;
        // Pluggy issues API keys valid for two hours.
        expires = Date.now() + 115 * 60 * 1000;
        return apiKey;
      }).catch((error) => {
        if (error.status === 429) throw error;
        throw new ProviderError(503, error.retrySeconds);
      }).finally(() => { authRequest = null; });
    }
    return await authRequest;
  }

  return async (path, options = {}) => {
    const key = await authenticate();
    try {
      return await request(path, { ...options, key });
    } catch (error) {
      if (error.status === 401 && key === apiKey) expires = 0;
      throw error;
    }
  };
}

export function validProviderItem(item, id, user, sandbox) {
  return item?.id === id && item.clientUserId === user && item.connector?.isSandbox === sandbox
    && (sandbox
      ? /^Pluggy Bank\b/i.test(item.connector.name)
      : item.connector.isOpenFinance === true && item.connector.type === 'PERSONAL_BANK');
}

export function providerState(item) {
  const execution = item.executionStatus;
  if (['WAITING_USER_INPUT', 'WAITING_USER_ACTION'].includes(item.status)
    || ['WAITING_USER_ACTION', 'USER_AUTHORIZATION_PENDING', 'USER_AUTHORIZATION_NOT_GRANTED',
      'ACCOUNT_NEEDS_ACTION', 'ACCOUNT_LOCKED', 'INVALID_CREDENTIALS_MFA',
      'ACCOUNT_CREDENTIALS_RESET', 'USER_AUTHORIZATION_REVOKED', 'USER_INPUT_TIMEOUT'].includes(execution)) return 'action';
  if (['UPDATING', 'CREATING', 'QUEUED'].includes(item.status)) return 'syncing';
  if (item.status !== 'UPDATED') return 'failed';
  if (item.hasResourcesPendingAuthorization === true || item.statusDetail?.isPending) return 'action';
  return execution === 'SUCCESS' ? 'updated' : 'partial';
}

async function list(provider, path, params, signal) {
  const query = new URLSearchParams({ ...params, pageSize: '100' });
  const rows = new Map();
  for (let page = 1; page <= 100; page++) {
    query.set('page', String(page));
    const result = await provider(path + '?' + query, { signal });
    if (!Array.isArray(result.results) || !Number.isInteger(result.totalPages) || result.totalPages < 0) {
      throw new ProviderError(502);
    }
    for (const row of result.results) {
      if (!isId(row?.id) || rows.has(row.id)) throw new ProviderError(502);
      rows.set(row.id, row);
    }
    if (page >= result.totalPages) {
      if (Number.isInteger(result.total) && rows.size !== result.total) throw new ProviderError(502);
      return [...rows.values()];
    }
  }
  throw new ProviderError(502);
}

export async function eligibleConnectors(provider, sandbox) {
  const params = new URLSearchParams(sandbox ? { sandbox: 'true' } : { isOpenFinance: 'true' });
  const result = await provider('/connectors?' + params);
  if (!Array.isArray(result.results) || result.totalPages > 1) throw new ProviderError(502);
  const matching = result.results.filter((row) => Number.isInteger(row.id) && row.id > 0
    && row.isSandbox === sandbox
    && (sandbox ? /^Pluggy Bank\b/i.test(row.name) : row.isOpenFinance === true && row.type === 'PERSONAL_BANK'));
  if (!matching.length) throw new ProviderError(503);
  return matching.map((row) => row.id);
}

async function recentTransactions(provider, accountId, since, signal) {
  const query = new URLSearchParams({ accountId, dateFrom: since });
  const rows = new Map();
  const usedCursors = new Set();
  for (let page = 1; page <= 100; page++) {
    const result = await provider('/v2/transactions?' + query, { signal });
    if (!Array.isArray(result.results)) throw new ProviderError(502);
    for (const row of result.results) {
      if (!isId(row?.id) || rows.has(row.id)) throw new ProviderError(502);
      rows.set(row.id, row);
    }
    if (result.next === null) return [...rows.values()];
    if (typeof result.next !== 'string' || !result.next.startsWith('?')) throw new ProviderError(502);
    const cursor = new URLSearchParams(result.next).get('after');
    if (!cursor || usedCursors.has(cursor)) throw new ProviderError(502);
    usedCursors.add(cursor);
    query.set('after', cursor);
  }
  throw new ProviderError(502);
}

const text = (value, fallback) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 180) : fallback;
const currency = (value) => typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : null;

function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)
    || !Number.isFinite(Date.parse(value))) throw new ProviderError(502);
  return value.slice(0, 10);
}

export async function snapshot(provider, item, signal) {
  const accounts = await list(provider, '/accounts', { itemId: item.id }, signal);
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const data = { accounts: [], transactions: [], bills: [] };
  for (const account of accounts) {
    if (account.itemId !== item.id) throw new ProviderError(502);
    const accountId = account.id;
    const accountCurrency = currency(account.currencyCode);
    data.accounts.push({
      id: accountId, name: text(account.name, 'Conta'), kind: text(account.type, 'OTHER'),
      balance: Number.isFinite(account.balance) ? account.balance : null, currency: accountCurrency,
    });
    const transactions = await recentTransactions(provider, accountId, since, signal);
    for (const row of transactions) {
      if (row.accountId !== accountId || !Number.isFinite(row.amount)) throw new ProviderError(502);
      const posted = date(row.date);
      if (posted < since) continue;
      data.transactions.push({
        id: row.id, account_id: accountId, description: text(row.description, 'Lançamento'),
        posted_on: posted, amount: row.amount, currency: currency(row.currencyCode) ?? accountCurrency,
      });
    }
    if (account.type !== 'CREDIT') continue;
    const bills = await list(provider, '/bills', { accountId }, signal);
    for (const row of bills) {
      if ((row.accountId && row.accountId !== accountId) || !Number.isFinite(row.totalAmount)) throw new ProviderError(502);
      data.bills.push({
        id: row.id, account_id: accountId, due_on: date(row.dueDate), amount: row.totalAmount,
        currency: currency(row.totalAmountCurrencyCode) ?? accountCurrency,
      });
    }
  }
  return data;
}
