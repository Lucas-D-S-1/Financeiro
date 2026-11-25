export const GRUPOS = [
  { id: 'fix', nome: 'Fixos' },
  { id: 'rec', nome: 'Extraordinário recorrente' },
  { id: 'nrec', nome: 'Extraordinário não recorrente' },
];

const ACERTO = 'Acerto do casal';
const REGISTRO_CARTAO = /^A (?:receber|pagar) · (.+) \((\d+(?:[.,]\d+)?)%\) · (\d+)\/(\d+) · cartão (.+)$/i;
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const moeda = cent => BRL.format(cent / 100).replace(/^-/, '−');
const soma = (linhas, campo) => linhas.reduce((s, r) => s + r[campo], 0);
const centavos = valor => Math.round(valor * 100);
export const mesValido = chave => /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(chave);
export const chaveLocal = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
export const mesExtenso = (chave, curto = false) => new Intl.DateTimeFormat('pt-BR', {
  month: curto ? 'short' : 'long', year: 'numeric', timeZone: 'UTC',
}).format(new Date(chave + '-01T12:00Z')).replace('.', '');
export function deslocarMes(chave, delta) {
  const [ano, mes] = chave.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1 + delta, 1)).toISOString().slice(0, 7);
}

const chaveCaixa = mes => mes.split('/').reverse().join('-');
const debitoAcerto = r => r.cat === ACERTO && /^A pagar · /i.test(r.desc);
const creditoAcerto = r => r.cat === ACERTO && /^A receber\b/i.test(r.desc);
const removerParcela = nome => nome.replace(/\s*\d{1,2}\/\d{1,2}\s*$/, '');
const numeroParcelaValido = (n, total) => Number.isInteger(n) && Number.isInteger(total) && n >= 1 && n <= total;

function lerCreditoCartao(r) {
  const partes = r.desc.match(REGISTRO_CARTAO);
  if (!partes) return null;
  const [, nome, p, n, total, titular] = partes;
  const percentual = Number(p.replace(',', '.')), atual = Number(n), parcelas = Number(total);
  if (percentual <= 0 || percentual > 100 || !numeroParcelaValido(atual, parcelas)) return null;
  return { ...r, nome, titular, percentual, atual, parcelas, valor: centavos(r.valor),
    chave: [titular, nome, percentual, parcelas, deslocarMes(chaveCaixa(r.mes), 1 - atual)].join('|') };
}

function agendaDaCompra(registro, adiante, chaveMes) {
  const agenda = [];
  for (let numero = registro.atual; numero <= registro.parcelas; numero++) {
    const mes = deslocarMes(chaveMes, numero - registro.atual);
    const candidatas = adiante.filter(r => r.parcela === numero && r.mes === mes);
    const conhecido = numero === registro.atual ? registro : candidatas.length === 1 ? candidatas[0] : null;
    agenda.push({ numero, mes, valor: conhecido?.valor ?? registro.valor, estimado: !conhecido });
  }
  return agenda;
}

function itemCartao(r, creditos, chaveMes) {
  const serie = creditos.filter(x => x.chave === r.chave);
  const unica = new Set(serie.map(x => x.atual)).size === serie.length;
  const agenda = agendaDaCompra(r, (unica ? serie : []).map(x => ({
    parcela: x.atual, mes: chaveCaixa(x.mes), valor: x.valor,
  })), chaveMes);
  return { id: 'cartao:' + r.id, grupo: 'nrec', nome: r.nome, categoria: ACERTO,
    forma: 'Cartão ' + r.titular, cartaoOutro: true, novo: r.atual === 1, previsto: true,
    atual: r.atual, parcelas: r.parcelas, valor: r.valor, agenda,
    totalParte: unica && serie.length === r.parcelas ? soma(serie, 'valor') : null,
    rateio: { meu: r.valor, outro: Math.round(r.valor * (100 - r.percentual) / r.percentual),
      percentual: r.percentual, estimado: r.percentual !== 100 } };
}

function itemDoCaderno(r, i, dados, recorrentes, chaveMes) {
  const pagar = debitoAcerto(r);
  const parcela = r.parcTotal > 1 && numeroParcelaValido(r.parcAtual, r.parcTotal);
  const fixo = (!pagar || !parcela) && (r.fixo || ['Fixo', 'Casa', 'Assinatura'].includes(r.tipo));
  const rotulo = String(r.rotulo || r.desc);
  const desc = r.desc.replace(/^A pagar · /i, '');
  const compromissoRecorrente = dados.regras.some(padrao => {
    try { return new RegExp(padrao, 'i').test(r.descOriginal || desc); }
    catch { return false; }
  });
  const grupo = fixo ? 'fix' : (recorrentes.has(r.lojaMensal) || compromissoRecorrente) ? 'rec' : 'nrec';
  const valor = centavos(r.valor);
  const atual = parcela ? r.parcAtual : 1, parcelas = parcela ? r.parcTotal : 1;
  const adiante = dados.parcelas.filter(x => r.chave && x.chave === r.chave)
    .map(x => ({ ...x, mes: chaveCaixa(x.mes), valor: centavos(x.valor) }));
  const cartaoOutro = pagar && parcela && dados.acerto !== null;
  const forma = cartaoOutro ? 'Cartão ' + dados.outro
    : pagar ? ACERTO
    : r.produto === 'cartao' ? 'Cartão ' + r.cartao
    : r.cartao && !['—', 'projetado'].includes(r.cartao) ? 'Conta ' + r.cartao
    : r.projetado ? 'Previsão' : null;
  const rateio = r.rateioMensal && {
    meu: centavos(r.rateioMensal.meu),
    outro: centavos(r.rateioMensal.outro),
    percentual: r.rateioMensal.percentual,
  };
  const nome = pagar ? desc.replace(/\s*\(\d+%\)$/, '') : rotulo;
  return { id: 'linha:' + i, grupo, nome: parcela ? removerParcela(nome) : nome,
    categoria: r.rotuloCat, valor, forma, atual, parcelas, data: r.dataCompra,
    previsto: !!r.projetado, cartaoOutro, rateio,
    novo: grupo === 'nrec' && atual === 1 && !r.projetado && !pagar && r.produto !== 'sintetico',
    agenda: parcela ? agendaDaCompra({ atual, parcelas, valor }, adiante, chaveMes) : [],
  };
}

export function lerMes(dados, chaveMes) {
  const historico = new Map();
  for (const { loja, mes } of dados.historico) {
    if (!loja) continue;
    if (!historico.has(loja)) historico.set(loja, new Set());
    historico.get(loja).add(mes);
  }
  const recorrentes = new Set([...historico].filter(([, meses]) => meses.size >= 2).map(([loja]) => loja));
  const creditos = dados.creditosCartao.map(lerCreditoCartao).filter(Boolean);
  const gastos = dados.linhas.filter(r => r.tipo !== 'Reembolso');
  const cartao = creditos.filter(r => chaveCaixa(r.mes) === chaveMes);
  // Algumas versões do contrato também podem trazer o débito espelhado.
  // Substitua cada espelho equivalente uma vez pelo crédito com a agenda.
  const semEspelho = [...cartao];
  const itens = gastos.filter(r => {
    if (!debitoAcerto(r)) return true;
    const espelho = lerCreditoCartao(r);
    if (!espelho) return true;
    const i = semEspelho.findIndex(c => c.chave === espelho.chave && c.valor === espelho.valor);
    if (i < 0) return true;
    semEspelho.splice(i, 1);
    return false;
  }).map((r, i) => itemDoCaderno(r, i, dados, recorrentes, chaveMes));
  for (const r of cartao) itens.push(itemCartao(r, creditos, chaveMes));

  const reembolsos = dados.linhas.filter(r => r.tipo === 'Reembolso');
  const creditosProprios = reembolsos.filter(creditoAcerto).reduce((s, r) => s + centavos(r.valor), 0);
  const outrosCreditos = reembolsos.reduce((s, r) => s + centavos(r.valor), 0) - creditosProprios;
  const base = gastos.filter(r => !debitoAcerto(r)).reduce((s, r) => s + centavos(r.valor), 0);
  const bruto = soma(itens, 'valor');
  const acerto = dados.acerto && {
    receber: centavos(dados.perfil === 'Lucas' ? dados.acerto.lucasRecebe : dados.acerto.juliaRecebe),
    pagar: centavos(dados.perfil === 'Lucas' ? dados.acerto.juliaRecebe : dados.acerto.lucasRecebe),
    previsto: dados.acerto.temPrevisao || cartao.length > 0,
  };
  if (acerto) acerto.liquido = acerto.receber - acerto.pagar;
  // O bruto de Categorias já soma repasses a pagar. A base sem acerto os
  // retira antes de descontar o saldo líquido, para contá-los uma única vez.
  const sem = base - outrosCreditos;
  const com = acerto ? sem - acerto.liquido
    : bruto - creditosProprios - outrosCreditos;
  for (const item of itens) {
    item.falta = soma(item.agenda.slice(1), 'valor');
    item.faltaEstimada = item.agenda.slice(1).some(r => r.estimado);
  }
  const parcelas = itens.filter(i => i.parcelas > 1 && i.atual < i.parcelas)
    .sort((a, b) => b.falta - a.falta);
  const proximo = deslocarMes(chaveMes, 1);
  const proximas = creditos.filter(r => r.atual === 1 && chaveCaixa(r.mes) === proximo);
  return { perfil: dados.perfil, outro: dados.outro, acerto, bruto, sem, com, parcelas,
    itens: itens.sort((a, b) => b.valor - a.valor), parcial: dados.parcial,
    previsoes: itens.some(i => i.previsto) || acerto?.previsto,
    proximo: proximas.length ? { mes: proximo, n: proximas.length, total: soma(proximas, 'valor') } : null,
  };
}
