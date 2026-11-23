import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID, createHmac } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as wait } from 'node:timers/promises';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { createPilot } from '../supabase/functions/pilot/pilot.mjs';
import { providerState } from '../supabase/functions/pilot/provider.mjs';
import { syntheticProvider } from './synthetic-provider.mjs';

const origin = 'http://localhost:56730';
const root = 'http://127.0.0.1:56721';
const mail = 'http://127.0.0.1:56724';
const version = '2026-11-piloto-1';
const randomTest = randomUUID().slice(0, 8);
const api = (path) => origin + '/functions/v1/pilot/' + path;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

async function request(handler, route, body = {}, headers = {}, method = 'POST') {
  return handler(new Request(api(route), { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined }));
}

async function authLink(address) {
  for (let tries = 0; tries < 40; tries++) {
    const list = await fetch(mail + '/api/v1/search?query=' + encodeURIComponent('to:' + address)).then((r) => r.json());
    if (list.messages?.length) {
      const message = await fetch(mail + '/api/v1/message/' + list.messages[0].ID).then((r) => r.json());
      const href = message.HTML.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1];
      if (href) return href.replaceAll('&amp;', '&');
    }
    await wait(200);
  }
  throw new Error('Link não chegou ao Mailpit');
}

function bearer(access) { return { Authorization: 'Bearer ' + access }; }

async function assertVisible(page, text) {
  await page.getByText(text, { exact: true }).first().waitFor({ state: 'visible', timeout: 10000 });
}

test('estados do provedor distinguem sucesso, falhas, MFA, parcial e autorização pendente', () => {
  for (const [status, executionStatus, expected] of [
    ['UPDATED', 'SUCCESS', 'updated'], ['LOGIN_ERROR', 'INVALID_CREDENTIALS', 'failed'],
    ['LOGIN_ERROR', 'ACCOUNT_LOCKED', 'action'], ['OUTDATED', 'SITE_NOT_AVAILABLE', 'failed'],
    ['UPDATED', 'PARTIAL_SUCCESS', 'partial'], ['LOGIN_ERROR', 'INVALID_CREDENTIALS_MFA', 'action'],
    ['WAITING_USER_INPUT', 'SUCCESS', 'action'], ['LOGIN_ERROR', 'ACCOUNT_NEEDS_ACTION', 'action'],
    ['UPDATED', 'USER_AUTHORIZATION_PENDING', 'action'], ['LOGIN_ERROR', 'USER_AUTHORIZATION_NOT_GRANTED', 'action'],
    ['UPDATING', undefined, 'syncing'], ['UPDATED', undefined, 'partial'],
  ]) assert.equal(providerState({ status, executionStatus }), expected);
  assert.equal(providerState({ status: 'UPDATED', executionStatus: 'SUCCESS', hasResourcesPendingAuthorization: true }), 'action');
});

test('Supabase e Mailpit reais, duas sessões e fluxo sintético do provedor', async (t) => {
  const { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = JSON.parse(execFileSync('node_modules/.bin/supabase',
    ['status', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  assert.equal(API_URL, root);
  assert.ok(ANON_KEY && SERVICE_ROLE_KEY);
  const db = createClient(root, SERVICE_ROLE_KEY, opts);
  const cleanups = [];
  t.after(async () => {
    for (const user of cleanups) await db.auth.admin.deleteUser(user);
  });

  const config = {
    url: root, serviceKey: SERVICE_ROLE_KEY, publicKey: ANON_KEY, base: origin, mode: 'sandbox',
    clientId: randomUUID(), clientSecret: randomUUID(), signingSecrets: [randomUUID()],
    workerKey: randomUUID(), contact: 'operador@example.test', webhook: 'https://example.test/functions/v1/pilot/webhook',
    oauth: null,
  };
  const fixture = syntheticProvider();
  const handler = createPilot(config, createClient, fixture.fetcher);
  const worker = () => request(handler, 'worker', {}, { 'X-Pilot-Worker': config.workerKey });
  const work = async (expected) => {
    const response = await worker();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).state, expected);
  };
  const event = (itemId, kind, owner) => ({
    clientId: config.clientId, eventId: randomUUID(), itemId, event: kind, ...(owner && { clientUserId: owner }),
  });
  const signed = (data, age = 0, alter = false) => {
    const stamp = Math.floor(Date.now() / 1000) - age;
    const signature = createHmac('sha256', config.signingSecrets[0])
      .update(stamp + '.' + JSON.stringify(data)).digest('hex');
    return request(handler, 'webhook', alter ? { ...data, itemId: randomUUID() } : data,
      { 'X-Pluggy-Signature': 't=' + stamp + ',v1=' + signature });
  };
  const database = async (query) => {
    const { data, error } = await query;
    assert.equal(Boolean(error), false);
    return data;
  };
  const createUser = async (label) => {
    const email = label + '-' + randomTest + '@example.test';
    const userData = await database(db.auth.admin.createUser({ email, email_confirm: true }));
    assert.ok(userData.user.id);
    cleanups.push(userData.user.id);
    return { id: userData.user.id, email };
  };
  const a = await createUser('a');
  const b = await createUser('b');
  const userA = fixture.add(a.id, 'Pluggy Bank sintético A');
  const userB = fixture.add(b.id, 'Pluggy Bank sintético B');

  const env = { ...process.env, PILOT_PUBLIC_URL: root, PILOT_PUBLIC_KEY: ANON_KEY, PILOT_WEB_URL: origin + '/' };
  execFileSync(process.execPath, ['tools/build.mjs'], { env, stdio: 'ignore' });
  // O site local usa a implementação real da API, mas fica sem Pluggy para o teste visual do aviso.
  const site = spawn(process.execPath, ['tools/site.mjs'], { stdio: 'ignore', env: {
    ...env, SUPABASE_URL: root, SUPABASE_ANON_KEY: ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    PILOT_MODE: 'sandbox', PILOT_PRIVACY_CONTACT: config.contact,
  } });
  t.after(() => { if (site.exitCode == null) site.kill(); });
  for (let tries = 0; tries < 40; tries++) {
    if (await fetch(origin).then((r) => r.ok).catch(() => false)) break;
    await wait(100);
  }
  assert.equal(site.exitCode, null);

  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const browserLogin = async (user) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(origin);
    await page.getByRole('textbox', { name: 'E-mail cadastrado' }).fill(user.email);
    await page.getByRole('button', { name: 'Enviar link de acesso' }).click();
    await page.goto(await authLink(user.email));
    await assertVisible(page, 'Antes de conectar');
    assert.equal(new URL(page.url()).origin, origin);
    assert.equal(new URL(page.url()).search, '');
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('gastos-piloto-auth')));
    assert.equal(session.user.id, user.id);
    return { page, context, headers: bearer(session.access_token) };
  };

  const A = await browserLogin(a);
  const B = await browserLogin(b);
  await t.test('convite obrigatório, redirecionamento fixo e aceite prévio', async () => {
    const noInvite = createClient(root, ANON_KEY, opts);
    const outcome = await noInvite.auth.signInWithOtp({
      email: 'sem-convite-' + randomTest + '@example.test', options: { shouldCreateUser: false },
    });
    assert.ok(outcome.error);
    const redirectUser = await createUser('redirect');
    const untrusted = await noInvite.auth.signInWithOtp({
      email: redirectUser.email,
      options: { shouldCreateUser: false, emailRedirectTo: 'https://example.invalid/outro' },
    });
    assert.equal(Boolean(untrusted.error), false);
    const link = await authLink(redirectUser.email);
    const redirect = await fetch(link, { redirect: 'manual' });
    assert.equal(new URL(redirect.headers.get('location')).origin, origin);

    assert.equal((await request(handler, 'token')).status, 401);
    assert.equal((await request(handler, 'token', {}, A.headers)).status, 403);
    assert.equal((await request(handler, 'accept', { version: 'antiga' }, A.headers)).status, 403);
    assert.equal((await request(handler, 'accept', { version }, { ...A.headers, Origin: 'https://example.invalid' })).status, 403);

    await A.page.getByRole('button', { name: 'Li e aceito participar' }).click();
    await assertVisible(A.page, 'Suas conexões');
    assert.equal((await request(handler, 'accept', { version }, B.headers)).status, 200);
    const rows = await database(db.from('pilot_consents').select().in('user_id', [a.id, b.id]));
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.version === version && row.accepted_at));
  });

  await t.test('tokens em options, retorno validado, webhook assinado e fila idempotente', async () => {
    const one = await request(handler, 'token', {}, A.headers);
    const two = await request(handler, 'token', {}, B.headers);
    assert.equal(one.status, 200);
    assert.equal(two.status, 200);
    const first = await one.json();
    const second = await two.json();
    assert.notEqual(first.token, second.token);
    assert.deepEqual(Object.keys(first).sort(), ['connectorIds', 'includeSandbox', 'token']);
    assert.equal(first.includeSandbox, true);
    assert.deepEqual(first.connectorIds, [2]);
    assert.equal(fixture.audit.auth, 1);
    assert.equal(fixture.audit.tokens[0].options.clientUserId, a.id);
    assert.equal(fixture.audit.tokens[0].options.avoidDuplicates, true);
    assert.equal(fixture.audit.tokens[1].options.clientUserId, b.id);

    const good = event(userA.item.id, 'item/created', a.id);
    assert.equal((await request(handler, 'webhook', good)).status, 401);
    assert.equal((await signed(good, 301)).status, 401);
    assert.equal((await signed(good, 0, true)).status, 401);
    assert.equal((await signed({ ...good, clientId: randomUUID() })).status, 403);
    assert.equal((await signed(event(randomUUID(), 'item/created', a.id))).status, 200);
    assert.equal((await signed(event(userB.item.id, 'item/created', a.id))).status, 200);
    assert.equal((await database(db.from('pilot_items').select().in('user_id', [a.id, b.id]))).length, 0);

    assert.equal((await request(handler, 'attach', { itemId: userB.item.id }, A.headers)).status, 404);
    assert.equal((await request(handler, 'attach', { itemId: userB.item.id }, B.headers)).status, 202);
    assert.deepEqual(await (await signed(good)).json(), { accepted: true });
    assert.equal((await signed(good)).status, 200);
    assert.equal((await database(db.from('pilot_events').select().eq('item_id', userA.item.id))).length, 1);
    const queue = await database(db.from('pilot_queue').select().eq('item_id', userA.item.id).single());
    assert.equal(queue.generation, 1);
    assert.equal((await request(handler, 'worker')).status, 401);
    await work('updated');
    await work('updated');
    assert.equal((await worker().then((r) => r.json())).processed, 0);
  });

  await t.test('telas isoladas, RLS em todas as tabelas, RPCs e endpoints privados', async () => {
    for (const [owner, foreign, ownLabel, wrongLabel] of [
      [A, b, 'Pluggy Bank sintético A', 'Pluggy Bank sintético B'],
      [B, a, 'Pluggy Bank sintético B', 'Pluggy Bank sintético A'],
    ]) {
      await owner.page.reload();
      await assertVisible(owner.page, ownLabel);
      assert.equal(await owner.page.getByText(wrongLabel, { exact: true }).count(), 0);
      await owner.page.getByText('Contas, transações e faturas').click();
      await assertVisible(owner.page, 'Saldo do cartão · R$ 200,00');
      await assertVisible(owner.page, 'Movimento na segunda página');
      await assertVisible(owner.page, 'Faturas');

      for (const table of ['consents', 'items', 'accounts', 'transactions', 'bills', 'events', 'queue']) {
        const url = root + '/rest/v1/pilot_' + table + '?select=user_id&user_id=eq.' + foreign.id;
        const headers = { apikey: ANON_KEY, ...owner.headers, 'Content-Type': 'application/json' };
        const result = await fetch(url, { headers });
        if (['events', 'queue'].includes(table)) assert.ok(result.status >= 400);
        else assert.deepEqual(await result.json(), []);
        for (const method of ['PATCH', 'DELETE', 'POST']) {
          const denied = await fetch(url, { method, headers, ...(method !== 'DELETE' && { body: JSON.stringify({ user_id: foreign.id }) }) });
          assert.ok(denied.status >= 400);
        }
        const anonymous = await fetch(url, { headers: { apikey: ANON_KEY } });
        assert.ok(anonymous.status >= 400);
      }
      for (const [rpc, body] of Object.entries({
        open_attempt: { p_user: foreign.id }, notify: { p_user: foreign.id, p_item: userA.item.id, p_name: null, p_event: null, p_kind: 'test' },
        disconnect: { p_user: foreign.id, p_item: null }, reconcile: {}, claim: {},
        finish: { p_item: userA.item.id, p_lease: randomUUID(), p_version: 1, p_state: 'updated', p_retry_seconds: null, p_snapshot: null },
      })) {
        for (const credentials of [{}, owner.headers]) {
          const denied = await fetch(root + '/rest/v1/rpc/pilot_' + rpc, {
            method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json', ...credentials },
            body: JSON.stringify(body),
          });
          assert.ok(denied.status >= 400);
        }
      }
    }

    for (const route of ['token', 'attach', 'disconnect']) {
      assert.equal((await request(handler, route, { itemId: userB.item.id }, A.headers)).status, 404);
      assert.equal((await request(handler, route, { itemId: userA.item.id }, B.headers)).status, 404);
      assert.equal((await request(handler, route, { itemId: userA.item.id })).status, 401);
    }
    const returnData = encodeURIComponent(userB.item.id);
    await A.page.goto(origin + '/?connect=1&itemId=' + returnData + '&next=https://example.invalid');
    await assertVisible(A.page, 'Pluggy Bank sintético A');
    assert.equal(await A.page.getByText('Pluggy Bank sintético B', { exact: true }).count(), 0);
    assert.equal(A.page.url(), origin + '/');
  });

  await t.test('alteração, remoção, parcial, Retry-After, 5xx, reconciliação e revogação', async () => {
    const complete = async () => (await database(db.from('pilot_items').select('last_complete').eq('id', userA.item.id).single())).last_complete;
    const previous = await complete();
    const update = event(userA.item.id, 'transactions/updated');
    userA.tx[0].description = 'Atualizada';
    userA.tx.pop();
    fixture.faults.set('/bills', [429, { 'Retry-After': '120' }]);
    await signed(update);
    await signed(update);
    await work('partial');
    assert.equal(await complete(), previous);
    const queued = await database(db.from('pilot_queue').select().eq('item_id', userA.item.id).single());
    assert.equal(queued.generation, 1);
    assert.ok(Date.parse(queued.available_at) > Date.now() + 110000);
    assert.equal((await worker().then((r) => r.json())).processed, 0);
    await database(db.from('pilot_queue').update({ available_at: new Date(0).toISOString() }).eq('item_id', userA.item.id));
    fixture.faults.set('/bills', [503]);
    await work('partial');
    const secondFailure = await database(db.from('pilot_queue').select().eq('item_id', userA.item.id).single());
    assert.ok(Date.parse(secondFailure.available_at) > Date.now() + 56000);
    assert.equal(await complete(), previous);
    fixture.faults.clear();
    await database(db.from('pilot_queue').update({ available_at: new Date(0).toISOString() }).eq('item_id', userA.item.id));
    await work('updated');
    assert.notEqual(await complete(), previous);
    const transactions = await database(db.from('pilot_transactions').select('description').eq('user_id', a.id));
    assert.deepEqual(transactions, [{ description: 'Atualizada' }]);
    userA.bills.length = 0;
    await database(db.from('pilot_items').update({ last_checked: new Date(0).toISOString() }).eq('id', userA.item.id));
    assert.equal((await request(handler, 'reconcile', {}, { 'X-Pilot-Worker': config.workerKey })).status, 200);
    await work('updated');
    assert.equal((await database(db.from('pilot_bills').select().eq('user_id', a.id))).length, 0);

    const leaseEvent = event(userA.item.id, 'item/updated', a.id);
    await signed(leaseEvent);
    const [lease] = await database(db.rpc('pilot_claim'));
    assert.equal(lease.item_id, userA.item.id);
    assert.equal((await request(handler, 'disconnect', { itemId: userA.item.id }, A.headers)).status, 200);
    assert.equal(await database(db.rpc('pilot_finish', {
      p_item: lease.item_id, p_lease: lease.lease_id, p_version: lease.generation,
      p_state: 'updated', p_retry_seconds: null, p_snapshot: null,
    })), false);
    assert.deepEqual(await (await signed(event(userA.item.id, 'item/updated', a.id))).json(), { accepted: false });
    assert.equal((await database(db.from('pilot_accounts').select().eq('user_id', a.id))).length, 0);
    await work('disconnected');
    assert.equal(fixture.users.has(userA.item.id), false);
    assert.equal(fixture.users.has(userB.item.id), true);
    assert.equal((await database(db.from('pilot_accounts').select().eq('user_id', b.id))).length, 1);

    assert.equal((await request(handler, 'revoke', {}, A.headers)).status, 200);
    assert.equal((await request(handler, 'token', {}, A.headers)).status, 403);
    assert.equal((await request(handler, 'accept', { version }, A.headers)).status, 200);
    assert.equal((await request(handler, 'token', {}, A.headers)).status, 403);
  });

  await t.test('sair, nova sessão e callback expirado', async () => {
    await A.page.getByRole('button', { name: 'Sair' }).click();
    await assertVisible(A.page, 'Entre com seu convite');
    assert.equal(await A.page.getByText('Pluggy Bank sintético A', { exact: true }).count(), 0);
    await A.page.goto(origin + '/?auth=1&code=invalid-expired&next=https://example.invalid');
    await assertVisible(A.page, 'O link expirou, foi usado ou foi aberto em outro navegador. Solicite um novo link.');
    assert.equal(A.page.url(), origin + '/');
    await wait(1100);
    await A.page.getByRole('textbox', { name: 'E-mail cadastrado' }).fill(a.email);
    await A.page.getByRole('button', { name: 'Enviar link de acesso' }).click();
    await wait(450);
    await A.page.goto(await authLink(a.email));
    await assertVisible(A.page, 'Piloto encerrado. Seus dados financeiros estão indisponíveis.');
  });

  await t.test('modo live limita titular e não habilita Sandbox', async () => {
    const liveConfig = { ...config, mode: 'live', owner: b.id, oauth: 'https://example.test/?connect=1' };
    const live = createPilot(liveConfig, createClient, fixture.fetcher);
    const stopping = createPilot({ ...liveConfig, connectionsEnabled: false }, createClient, fixture.fetcher);
    assert.equal((await request(stopping, 'token', {}, B.headers)).status, 503);
    assert.equal((await (await request(stopping, 'setup', {}, B.headers)).json()).ready, false);
    assert.equal((await request(live, 'token', {}, A.headers)).status, 403);
    const result = await request(live, 'token', {}, B.headers);
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal(data.includeSandbox, false);
    assert.deepEqual(data.connectorIds, [601]);
    assert.equal(fixture.audit.tokens.at(-1).options.oauthRedirectUri, 'https://example.test/?connect=1');
  });
});
