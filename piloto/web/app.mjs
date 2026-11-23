import { createClient } from '@supabase/supabase-js';
import { PluggyConnect } from 'pluggy-connect-sdk';

const $ = (id) => document.getElementById(id);
const authOptions = { auth: { flowType: 'pkce', detectSessionInUrl: false, storageKey: 'gastos-piloto-auth' } };
const supabase = createClient(PILOT_PUBLIC.url, PILOT_PUBLIC.key, authOptions);
const screenIds = ['login', 'notice', 'provision', 'dashboard', 'paused'];
const states = {
  connecting: 'Conectando', syncing: 'Sincronizando', updated: 'Atualizado', action: 'Ação necessária',
  partial: 'Parcial', failed: 'Falhou', disconnecting: 'Removendo conexão', disconnected: 'Desconectado',
};
const show = (id) => { for (const screen of screenIds) $(screen).hidden = screen !== id; };
let session = null;
let widget;
let sessionChange = 0;
let lastRender = '';
let refreshing = false;

function message(text = '') {
  $('message').textContent = text;
  $('message').hidden = !text;
}

async function api(route, body = {}) {
  if (!session) throw new Error('login');
  const response = await fetch(PILOT_PUBLIC.api + '/' + route, {
    method: 'POST', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'unavailable');
  return response.json();
}

function element(type, content, className) {
  const node = document.createElement(type);
  if (content != null) node.textContent = content;
  if (className) node.className = className;
  return node;
}

function button(label, task) {
  const node = element('button', label, 'secondary');
  node.type = 'button';
  node.addEventListener('click', () => withButton(node, task));
  return node;
}

const formatDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const formatDay = (value) => value.split('-').reverse().join('/');
function amount(value, currency) {
  if (value == null) return 'Indisponível';
  return new Intl.NumberFormat('pt-BR', currency
    ? { style: 'currency', currency }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function table(title, headers, rows) {
  if (!rows.length) return element('p', title + ' ainda indisponíveis.', 'quiet');
  const frame = element('div', null, 'table-scroll');
  const result = element('table');
  const thead = element('thead');
  const columns = element('tr');
  for (const [index, label] of headers.entries()) {
    const th = element('th', label, index === headers.length - 1 ? 'amount' : null);
    th.scope = 'col';
    columns.append(th);
  }
  thead.append(columns);
  const tbody = element('tbody');
  for (const row of rows) {
    const tr = element('tr');
    for (const [i, value] of row.entries()) tr.append(element('td', value, i === row.length - 1 ? 'amount' : null));
    tbody.append(tr);
  }
  result.append(element('caption', title), thead, tbody);
  frame.append(result);
  return frame;
}

function renderItems(items, accounts, tx, bills, canConnect) {
  const key = JSON.stringify([items, accounts, tx, bills, canConnect]);
  if (key === lastRender) return;
  lastRender = key;
  const expanded = new Set([...$('items').querySelectorAll('details[open]')].map((detail) => detail.dataset.item));
  $('items').replaceChildren();
  $('empty').hidden = items.length > 0;

  for (const item of items) {
    const connection = element('article', null, 'connection');
    const top = element('div', null, 'item-top');
    const badge = element('span', states[item.state], 'state');
    badge.dataset.state = item.state;
    top.append(element('h3', item.name), badge);
    const time = item.last_complete
      ? 'Última atualização completa em ' + formatDate.format(new Date(item.last_complete))
      : 'Aguardando a primeira atualização completa.';
    connection.append(top, element('p', time, 'quiet'));
    if (item.state === 'action') connection.append(element('p', 'Confira a autorização no banco ou abra a conexão para continuar.'));
    if (item.state === 'partial') connection.append(element('p', 'Alguns dados estão pendentes. As informações disponíveis aparecem abaixo.'));
    if (item.state === 'disconnecting') connection.append(element('p', 'As cópias no piloto foram apagadas. A remoção na Pluggy está pendente.'));
    const actions = element('div', null, 'actions');
    if (canConnect && ['failed', 'action', 'partial'].includes(item.state)) {
      actions.append(button('Reconectar', () => connect(item.id)));
    }
    if (!['disconnecting', 'disconnected'].includes(item.state)) {
      actions.append(button('Desconectar', async () => {
        if (!window.confirm('Desconectar esta instituição e apagar os dados dela?')) return;
        await api('disconnect', { itemId: item.id });
        clearItems();
        message('Remoção solicitada.');
        await refresh();
      }));
    }
    if (actions.children.length) connection.append(actions);
    const associated = accounts.filter((account) => account.item_id === item.id);
    if (associated.length) {
      const detail = element('details');
      detail.dataset.item = item.id;
      detail.open = expanded.has(item.id);
      detail.append(element('summary', 'Contas, transações e faturas'));
      const list = element('dl');
      for (const account of associated) {
        list.append(element('dt', account.name), element('dd',
          (account.kind === 'CREDIT' ? 'Saldo do cartão' : 'Saldo retornado') + ' · ' + amount(account.balance, account.currency)));
      }
      detail.append(list);
      const names = new Map(associated.map((account) => [account.id, account.name]));
      detail.append(table('Transações recentes', ['Data', 'Descrição', 'Conta', 'Valor'],
        tx.filter((row) => names.has(row.account_id)).map((row) => [
          formatDay(row.posted_on), row.description, names.get(row.account_id), amount(row.amount, row.currency),
        ])));
      detail.append(table('Faturas', ['Vencimento', 'Cartão', 'Total'],
        bills.filter((row) => names.has(row.account_id)).map((row) => [
          formatDay(row.due_on), names.get(row.account_id), amount(row.amount, row.currency),
        ])));
      connection.append(detail);
    }
    $('items').append(connection);
  }
}

function clearItems() {
  lastRender = '';
  $('items').replaceChildren();
  $('connect').hidden = true;
  $('revoke').hidden = true;
}

async function refresh() {
  if (!session || refreshing || document.hidden) return;
  refreshing = true;
  const revision = sessionChange;
  try {
    const [setup, consent, owned] = await Promise.all([
      api('setup'),
      supabase.from('pilot_consents').select('version,expires_at,revoked_at').maybeSingle(),
      supabase.from('pilot_items').select('id,name,state,last_complete').order('name'),
    ]);
    if (revision !== sessionChange) return;
    if (consent.error || owned.error) throw new Error('unavailable');

    if (setup.mode === 'paused') {
      clearItems();
      show('paused');
      return;
    }
    if (!consent.data && !setup.contact) {
      clearItems();
      show('paused');
      return;
    }
    if (!consent.data) {
      clearItems();
      const contact = $('contact');
      contact.textContent = setup.contact;
      contact.href = 'mailto:' + setup.contact;
      $('accept').dataset.version = setup.version;
      show('notice');
      return;
    }
    const isActive = !consent.data.revoked_at && Date.parse(consent.data.expires_at) > Date.now();
    if (isActive && setup.mode === 'live' && !setup.ready && !owned.data.length) {
      clearItems();
      show('provision');
      return;
    }

    let rows = [[], [], []];
    if (isActive && owned.data.some((item) => item.last_complete || item.state === 'partial')) {
      const result = await Promise.all([
        supabase.from('pilot_accounts').select('id,item_id,name,kind,balance,currency').order('name'),
        supabase.from('pilot_transactions').select('account_id,description,posted_on,amount,currency').order('posted_on', { ascending: false }).limit(100),
        supabase.from('pilot_bills').select('account_id,due_on,amount,currency').order('due_on', { ascending: false }).limit(50),
      ]);
      if (result.some(({ error }) => error)) throw new Error('unavailable');
      rows = result.map(({ data }) => data);
    }
    if (revision !== sessionChange) return;
    $('environment').textContent = isActive
      ? setup.mode === 'sandbox' ? 'Sandbox · dados sintéticos' : 'Open Finance'
      : 'Piloto encerrado. Seus dados financeiros estão indisponíveis.';
    $('connect').hidden = !isActive || !setup.ready;
    $('revoke').hidden = !isActive;
    if (isActive && !setup.ready) {
      message(setup.mode === 'sandbox' ? 'A conexão Sandbox aguarda configuração.' : 'A conexão aguarda liberação no ambiente.');
    }
    renderItems(owned.data, ...rows, isActive && setup.ready);
    show('dashboard');
  } catch (error) {
    if (revision !== sessionChange) return;
    clearItems();
    show('paused');
    message(error.message === 'invite' ? 'Este acesso aguarda liberação do convite.' : 'Não foi possível consultar o piloto. Tente novamente em instantes.');
  } finally {
    refreshing = false;
    if (revision !== sessionChange && session) void refresh();
  }
}

async function destroyWidget() {
  const old = widget;
  widget = null;
  if (old) await old.destroy().catch(() => {});
}

async function connect(itemId) {
  if (widget) return;
  const revision = sessionChange;
  message('Abrindo Pluggy Connect…');
  const config = await api('token', { itemId });
  if (revision !== sessionChange) return;
  let signaled = false;

  async function finish(id, success) {
    if (revision !== sessionChange) return;
    signaled = true;
    message(success ? 'Autorização recebida. Aguarde a confirmação da sincronização.'
      : 'A instituição não confirmou a conexão. Confira o estado e tente novamente se for necessário.');
    if (id) {
      try {
        await api('attach', { itemId: id });
      } catch {
        message('Aguardando o retorno da Pluggy. Confira o estado em instantes.');
      }
    }
    await refresh();
  }

  widget = new PluggyConnect({
    connectToken: config.token,
    updateItem: itemId,
    includeSandbox: config.includeSandbox,
    connectorIds: config.connectorIds,
    allowConnectInBackground: false,
    products: ['ACCOUNTS', 'TRANSACTIONS', 'CREDIT_CARDS'],
    onSuccess: ({ item }) => finish(item?.id, true),
    onError: ({ data }) => finish(data?.item?.id, false),
    onClose: async () => {
      if (!signaled && revision === sessionChange) message('Conexão fechada. Você pode tentar de novo.');
      await destroyWidget();
      if (revision === sessionChange) await refresh();
    },
  });
  try {
    await widget.init();
  } catch {
    await destroyWidget();
    throw new Error('widget');
  }
}

async function withButton(node, task) {
  if (node.disabled) return;
  node.disabled = true;
  try {
    await task();
  } catch {
    message('Não foi possível concluir esta ação. Tente de novo em instantes.');
  } finally {
    node.disabled = false;
  }
}

$('login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  void withButton(form.querySelector('button'), async () => {
    const { error } = await supabase.auth.signInWithOtp({
      email: new FormData(form).get('email').trim(),
      options: { emailRedirectTo: location.origin + '/?auth=1', shouldCreateUser: false },
    });
    if (error && ![400, 422, 429].includes(error.status)) throw error;
    form.reset();
    message('Se este endereço tiver convite, o link chegará por e-mail. Abra-o neste navegador.');
  });
});
$('accept').addEventListener('click', (event) => void withButton(event.currentTarget, async () => {
  await api('accept', { version: $('accept').dataset.version });
  message();
  await refresh();
}));
$('connect').addEventListener('click', (event) => void withButton(event.currentTarget, () => connect()));
async function revoke() {
  if (!window.confirm('Encerrar o acesso financeiro deste piloto e apagar os dados?')) return;
  await api('revoke');
  clearItems();
  await destroyWidget();
  message('Seu aceite foi revogado e as cópias financeiras do piloto foram apagadas.');
  await refresh();
}
for (const id of ['revoke', 'provision-revoke']) {
  $(id).addEventListener('click', (event) => void withButton(event.currentTarget, revoke));
}
$('check-setup').addEventListener('click', () => void refresh());
$('logout').addEventListener('click', (event) => void withButton(event.currentTarget, async () => {
  clearItems();
  await destroyWidget();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
  message('Você saiu.');
}));

function setSession(next) {
  if (session?.user.id === next?.user.id && session && next) {
    session = next;
    return;
  }
  sessionChange++;
  session = next;
  clearItems();
  $('logout').hidden = !session;
  show(session ? null : 'login');
  if (session) setTimeout(() => void refresh(), 0);
  else void destroyWidget();
}

const parameters = new URLSearchParams(location.search);
const fragment = new URLSearchParams(location.hash.slice(1));
const code = parameters.get('code');
if (location.search || location.hash) history.replaceState(null, '', '/');
if (parameters.has('error') || fragment.has('error')) {
  message('O acesso foi cancelado ou o link expirou. Solicite um novo link.');
} else if (parameters.get('auth') === '1') {
  const result = code && await supabase.auth.exchangeCodeForSession(code);
  if (!result || result.error) message('O link expirou, foi usado ou foi aberto em outro navegador. Solicite um novo link.');
} else if (parameters.get('connect') === '1') {
  message('Retorno do banco recebido. Aguarde o resultado da sincronização no painel.');
}
supabase.auth.onAuthStateChange((_, next) => setSession(next));

setInterval(() => void refresh(), 10000);
window.addEventListener('pagehide', clearItems);
window.addEventListener('pageshow', () => void refresh());
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
