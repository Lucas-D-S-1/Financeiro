import { timingSafeEqual } from 'node:crypto';
import { createProvider, eligibleConnectors, isId, ProviderError, providerState, snapshot, validProviderItem } from './provider.mjs';

const VERSION = '2026-11-piloto-1';
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const PERSONAL_BASE = 'rxfeyrnayhvyfonuxddt';
const EVENTS = new Set([
  'item/created', 'item/updated', 'item/error', 'item/deleted', 'item/login_succeeded',
  'item/waiting_user_input', 'item/waiting_user_action',
  'transactions/created', 'transactions/updated', 'transactions/deleted',
]);
class HttpError extends Error { constructor(status, code) { super(code); this.status = status; } }

function equals(a, b) {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function rootUrl(value) {
  if (!value) return null;
  const parsed = new URL(value);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('URL inválida');
  return parsed;
}

export function readConfig(get) {
  const url = rootUrl(get('SUPABASE_URL'));
  const base = rootUrl(get('PILOT_WEB_URL'));
  const webhook = rootUrl(get('PILOT_WEBHOOK_URL'));
  const mode = get('PILOT_MODE') ?? 'paused';
  const owner = get('PILOT_OWNER_ID');
  const clientId = get('PLUGGY_CLIENT_ID');
  const clientSecret = get('PLUGGY_CLIENT_SECRET');
  const signingSecrets = [get('PLUGGY_WEBHOOK_SECRET'), get('PLUGGY_WEBHOOK_SECRET_PREVIOUS')].filter(Boolean);
  const workerKey = get('PILOT_WORKER_KEY');
  const serviceKey = get('SUPABASE_SERVICE_ROLE_KEY');
  const publicKey = get('SUPABASE_ANON_KEY');
  const contact = get('PILOT_PRIVACY_CONTACT');
  if (!url || !base || !serviceKey || !publicKey || url.hostname.includes(PERSONAL_BASE)
    || !['sandbox', 'live', 'paused'].includes(mode) || base.pathname !== '/'
    || (base.protocol !== 'https:' && !(mode !== 'live' && base.hostname === 'localhost' && base.protocol === 'http:'))
    || (webhook && (webhook.protocol !== 'https:' || !webhook.pathname.endsWith('/pilot/webhook')))
    || (mode === 'live' && !isId(owner))) throw new Error('Configuração do piloto inválida');
  return {
    url: url.origin, serviceKey, publicKey, base: base.origin, owner, mode, clientId, clientSecret,
    connectionsEnabled: get('PILOT_CONNECT_ENABLED') !== '0',
    signingSecrets, workerKey, contact: contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact : null,
    webhook: webhook?.href, oauth: base.protocol === 'https:' ? new URL('/?connect=1', base).href : null,
  };
}

async function readBytes(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'body');
  const output = new Uint8Array(limit);
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return output.subarray(0, length);
    if (length + value.length > limit) {
      void reader.cancel();
      throw new HttpError(413, 'body');
    }
    output.set(value, length);
    length += value.length;
  }
}

function json(bytes) {
  try {
    const value = JSON.parse(decoder.decode(bytes));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch { /* O conteúdo recebido não entra em log. */ }
  throw new HttpError(400, 'body');
}

async function verified(request, secrets, body) {
  const header = /^t=(\d{1,12}),\s*v1=([0-9a-f]{64})$/.exec(request.headers.get('X-Pluggy-Signature')?.trim() ?? '');
  if (!header || Math.abs(Math.floor(Date.now() / 1000) - Number(header[1])) > 300) return false;
  const prefix = encoder.encode(header[1] + '.');
  const message = new Uint8Array(prefix.length + body.length);
  message.set(prefix);
  message.set(body, prefix.length);
  const digest = Uint8Array.from(header[2].match(/../g), (hex) => parseInt(hex, 16));
  for (const secret of secrets) {
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    if (await crypto.subtle.verify('HMAC', key, digest, message)) return true;
  }
  return false;
}

function active(consent) {
  return Boolean(consent && !consent.revoked_at && Date.parse(consent.expires_at) > Date.now());
}

function retry(error, attempts) {
  return Math.max(error?.retrySeconds ?? 0, Math.min(3600, 30 * 2 ** Math.min(7, Math.max(0, attempts - 1))));
}

export function createPilot(config, createClient, fetchProvider = fetch) {
  const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(4500) }) } };
  const db = createClient(config.url, config.serviceKey, clientOptions);
  const auth = createClient(config.url, config.publicKey, clientOptions);
  const provider = createProvider(config, fetchProvider);
  const sandbox = config.mode === 'sandbox';
  const providerReady = Boolean(config.clientId && config.clientSecret && config.signingSecrets.length);
  const connectReady = config.mode !== 'paused' && config.connectionsEnabled !== false
    && providerReady && Boolean(config.webhook && config.contact);

  async function data(query) {
    const { data: result, error } = await query;
    if (error) throw new HttpError(503, 'storage');
    return result;
  }

  function rpc(name, args) {
    return data(db.rpc('pilot_' + name, args));
  }

  function findItem(id) {
    return data(db.from('pilot_items').select('id,user_id,state').eq('id', id).maybeSingle());
  }

  function owned(item, user) {
    if (!item || item.user_id !== user) throw new HttpError(404, 'item');
    return item;
  }

  async function loadItem(id, user, signal) {
    const item = await provider('/items/' + id, { signal });
    return validProviderItem(item, id, user, sandbox) ? item : null;
  }

  async function notify(user, id, verifiedItem, event = null, kind = 'widget') {
    return rpc('notify', {
      p_user: user, p_item: id,
      p_name: verifiedItem ? String(verifiedItem.connector.name ?? 'Instituição').slice(0, 100) : null,
      p_event: event, p_kind: kind,
    });
  }

  async function webhook(request) {
    if (!providerReady || config.mode === 'paused') throw new HttpError(503, 'setup');
    const body = await readBytes(request, 65536);
    if (!await verified(request, config.signingSecrets, body)) throw new HttpError(401, 'signature');
    const message = json(body);
    if (message.clientId !== config.clientId) throw new HttpError(403, 'application');
    if (!EVENTS.has(message.event) || !isId(message.eventId) || !isId(message.itemId)) return { accepted: false };

    const item = await findItem(message.itemId);
    if (item) {
      if (config.owner && item.user_id !== config.owner) return { accepted: false };
      if (item.state === 'disconnected' || item.state === 'disconnecting') return { accepted: false };
      if (message.event.startsWith('item/') && message.clientUserId !== item.user_id) return { accepted: false };
      return { accepted: await notify(item.user_id, item.id, null, message.eventId, message.event) };
    }
    if (!['item/created', 'item/updated', 'item/waiting_user_input', 'item/waiting_user_action',
      'item/login_succeeded', 'item/error'].includes(message.event) || !isId(message.clientUserId)
      || (config.owner && message.clientUserId !== config.owner)) return { accepted: false };

    const consent = await data(db.from('pilot_consents').select('expires_at,revoked_at,connect_until')
      .eq('user_id', message.clientUserId).maybeSingle());
    if (!active(consent) || !consent.connect_until || Date.parse(consent.connect_until) <= Date.now()) return { accepted: false };
    let verifiedItem;
    try {
      verifiedItem = await loadItem(message.itemId, message.clientUserId, AbortSignal.timeout(2000));
    } catch (error) {
      if (error.status === 404) return { accepted: false };
      throw error;
    }
    return { accepted: Boolean(verifiedItem && await notify(message.clientUserId, message.itemId,
      verifiedItem, message.eventId, message.event)) };
  }

  async function work() {
    const [job] = await rpc('claim');
    if (!job) return { processed: 0 };
    const finish = (state, retrySeconds = null, result = null) => rpc('finish', {
      p_item: job.item_id, p_lease: job.lease_id, p_version: job.generation, p_state: state,
      p_retry_seconds: retrySeconds, p_snapshot: result,
    });
    const result = (state) => ({ processed: 1, state });
    const removal = job.kind === 'remove';
    if (!providerReady || (config.owner && config.owner !== job.user_id) || config.mode === 'paused') {
      const state = removal ? 'disconnecting' : 'failed';
      await finish(state, retry(null, job.attempts));
      return result(state);
    }

    try {
      const signal = AbortSignal.timeout(25000);
      const item = await loadItem(job.item_id, job.user_id, signal);
      if (!item) {
        const state = removal ? 'disconnecting' : 'failed';
        await finish(state, removal ? retry(null, job.attempts) : null);
        return result(state);
      }
      if (removal) {
        await provider('/items/' + job.item_id, { method: 'DELETE', signal });
        await finish('disconnected');
        return result('disconnected');
      }
      const state = providerState(item);
      let rows = null;
      if (['updated', 'partial'].includes(state)) {
        try {
          rows = await snapshot(provider, item, signal);
        } catch (error) {
          await finish('partial', error instanceof ProviderError ? retry(error, job.attempts) : null);
          return result('partial');
        }
      }
      await finish(state, state === 'syncing' && job.attempts < 8 ? retry(null, job.attempts) : null, rows);
      return result(state);
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
      const state = error.status === 404 ? 'disconnected' : removal ? 'disconnecting' : 'failed';
      const temporary = error.status === 429 || error.status >= 500;
      await finish(state, state !== 'disconnected' && (removal || temporary) ? retry(error, job.attempts) : null);
      return result(state);
    }
  }

  return async (request) => {
    const origin = request.headers.get('Origin');
    const headers = {
      'Cache-Control': 'no-store', 'Content-Type': 'application/json', 'Vary': 'Origin',
      ...(origin === config.base && {
        'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'authorization,content-type,apikey,x-client-info',
      }),
    };
    const reply = (status, value) => new Response(value === undefined ? null : JSON.stringify(value), { status, headers });
    const route = new URL(request.url).pathname.split('/').filter(Boolean).at(-1);

    try {
      if (origin && origin !== config.base) throw new HttpError(403, 'origin');
      if (request.method === 'OPTIONS') return reply(204);
      if (request.method !== 'POST') throw new HttpError(405, 'method');
      if (route === 'webhook') {
        let deadline;
        try {
          const accepted = await Promise.race([
            webhook(request),
            new Promise((_, reject) => {
              deadline = setTimeout(() => reject(new HttpError(503, 'deadline')), 8000);
            }),
          ]);
          return reply(200, accepted);
        } finally {
          clearTimeout(deadline);
        }
      }
      if (route === 'worker' || route === 'reconcile') {
        const key = request.headers.get('X-Pilot-Worker') ?? '';
        if (!config.workerKey || !equals(key, config.workerKey)) throw new HttpError(401, 'worker');
        if (route === 'reconcile') {
          await rpc('reconcile');
          return reply(200, { queued: true });
        }
        return reply(200, await work());
      }

      const token = /^Bearer (\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
      if (!token) throw new HttpError(401, 'login');
      const { data: { user }, error } = await auth.auth.getUser(token);
      if (error || !isId(user?.id) || !user.email_confirmed_at) throw new HttpError(401, 'login');
      if (config.owner && user.id !== config.owner) throw new HttpError(403, 'invite');

      const input = json(await readBytes(request, 4096));
      if (input.itemId != null && !isId(input.itemId)) throw new HttpError(400, 'item');
      if (route === 'setup') return reply(200, { ready: connectReady, contact: config.contact, mode: config.mode, version: VERSION });
      if (route === 'accept') {
        if (!config.contact || input.version !== VERSION || config.mode === 'paused') throw new HttpError(403, 'notice');
        await data(db.from('pilot_consents').upsert({ user_id: user.id, version: VERSION },
          { onConflict: 'user_id', ignoreDuplicates: true }));
        return reply(200, { received: true });
      }
      if (route === 'revoke' || route === 'disconnect') {
        if (route === 'disconnect') owned(isId(input.itemId) ? await findItem(input.itemId) : null, user.id);
        await rpc('disconnect', { p_user: user.id, p_item: route === 'disconnect' ? input.itemId : null });
        return reply(200, { removalRequested: true });
      }
      if (!['token', 'attach'].includes(route)) throw new HttpError(404, 'route');
      if (!providerReady || config.mode === 'paused' || (route === 'token' && !connectReady)) {
        throw new HttpError(503, 'setup');
      }
      const consent = await data(db.from('pilot_consents').select('expires_at,revoked_at,connect_until').eq('user_id', user.id).maybeSingle());
      if (!active(consent)) throw new HttpError(403, 'consent');
      const known = input.itemId ? await findItem(input.itemId) : null;
      if (known) {
        owned(known, user.id);
        if (['disconnecting', 'disconnected'].includes(known.state)) throw new HttpError(404, 'item');
      }
      if (route === 'token') {
        if (input.itemId && !known) throw new HttpError(404, 'item');
        const connectorIds = await eligibleConnectors(provider, sandbox);
        if (!await rpc('open_attempt', { p_user: user.id })) throw new HttpError(403, 'consent');
        const { accessToken } = await provider('/connect_token', { method: 'POST', body: {
          ...(input.itemId && { itemId: input.itemId }),
          options: {
            clientUserId: user.id, avoidDuplicates: true, webhookUrl: config.webhook,
            ...(config.oauth && { oauthRedirectUri: config.oauth }),
          },
        } });
        if (typeof accessToken !== 'string' || !accessToken) throw new HttpError(503, 'provider');
        return reply(200, { token: accessToken, includeSandbox: sandbox, connectorIds });
      }

      if (!input.itemId || (!known && (!consent.connect_until || Date.parse(consent.connect_until) <= Date.now()))) {
        throw new HttpError(404, 'item');
      }
      let attached;
      try {
        attached = await loadItem(input.itemId, user.id);
      } catch (error) {
        if (error.status === 404) throw new HttpError(404, 'item');
        throw error;
      }
      if (!attached || !await notify(user.id, input.itemId, attached)) throw new HttpError(404, 'item');
      return reply(202, { queued: true });
    } catch (error) {
      if (error instanceof HttpError) return reply(error.status, { error: error.message });
      return reply(error instanceof ProviderError && error.status === 429 ? 429 : 503, { error: 'provider' });
    }
  };
}
