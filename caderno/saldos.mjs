// D008 + D012_Hoje: leitura dos saldos informados a partir das linhas brutas do payload.
// Não usa `Number(s.saldo)||0`: vazio, nulo ou texto não numérico é ausência, nunca R$ 0,00.
// A soma do total é a única conta feita aqui, e só quando todas as contas listadas têm valor e data.
const DIA = 24 * 3600 * 1000;

export function lerValorSaldo(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !/^\s*-?\d+(\.\d+)?\s*$/.test(v)) return null;
  return Number(v);
}

// Aceita ISO (AAAA-MM-DD[THH:MM[:SS]][Z|±HH:MM]) e DD/MM/AAAA[ HH:MM]. O resto é "data não informada".
export function lerDataSaldo(v, agora) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/);
  let ano, mes, dia, h = null, min = null, d;
  if (m) {
    [ano, mes, dia] = [+m[1], +m[2], +m[3]];
    if (m[4] !== undefined) { h = +m[4]; min = +m[5]; }
    d = m[7] ? new Date(s.replace(' ', 'T')) : new Date(ano, mes - 1, dia, h ?? 0, min ?? 0, m[6] ? +m[6] : 0);
  } else if ((m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/))) {
    [dia, mes, ano] = [+m[1], +m[2], +m[3]];
    if (m[4] !== undefined) { h = +m[4]; min = +m[5]; }
    d = new Date(ano, mes - 1, dia, h ?? 0, min ?? 0);
  } else return null;
  if (Number.isNaN(d.getTime()) || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  // Calendário real: 31/02 não vira 03/03.
  if (!m[7] && (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia)) return null;
  if (h !== null && (h > 23 || min > 59)) return null;
  if (d.getTime() > agora.getTime()) return null;
  return { data: d, temHora: h !== null };
}

const inicioDoDia = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function lerSaldosInformados(linhas, pessoa, contasLedger, agora) {
  if (!Array.isArray(linhas)) throw new Error('Saldos inválidos');
  const contas = new Map();
  for (const r of linhas) {
    if (!r || r.person !== pessoa) continue;
    const banco = typeof r.bank === 'string' && r.bank.trim() ? r.bank.trim() : null;
    if (!banco) continue;
    const produto = typeof r.product === 'string' && r.product.trim() ? r.product.trim() : 'conta';
    const valor = lerValorSaldo(r.saldo);
    const lida = lerDataSaldo(r.atualizado_em, agora);
    const idade = lida ? Math.round((inicioDoDia(agora) - inicioDoDia(lida.data)) / DIA) : null;
    const fonte = typeof r.fonte === 'string' && r.fonte.trim() ? r.fonte.trim() : null;
    contas.set(banco + '|' + produto, { banco, produto, valor, estado: valor === null ? 'vazio' : 'informado',
      data: lida?.data || null, temHora: !!lida?.temHora, idade, antigo: idade !== null && idade >= 2, fonte });
  }
  for (const c of contasLedger || []) {
    const k = c.banco + '|' + c.produto;
    if (!contas.has(k)) contas.set(k, { banco: c.banco, produto: c.produto, valor: null, estado: 'ausente', data: null, temHora: false, idade: null, antigo: false, fonte: null });
  }
  const lista = [...contas.values()].sort((a, b) => a.banco.localeCompare(b.banco, 'pt-BR') || a.produto.localeCompare(b.produto, 'pt-BR'));
  const semValor = lista.filter(c => c.valor === null), semData = lista.filter(c => c.valor !== null && !c.data);
  let total = null;
  if (lista.length && !semValor.length && !semData.length) {
    const maisAntiga = lista.reduce((a, c) => c.data < a ? c.data : a, lista[0].data);
    total = { valor: lista.reduce((s, c) => s + c.valor, 0), n: lista.length, maisAntiga };
  }
  return { pessoa, contas: lista, total, semValor, semData, nenhum: semValor.length === lista.length };
}
