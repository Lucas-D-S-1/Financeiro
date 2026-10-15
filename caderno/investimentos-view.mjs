// D007 (+ D012_Investimentos): clona as fontes aprovadas e preenche com o que o motor já calculou
// (aplicarVendas/posicaoHoje/referencias/fluxoInvestimentos). Nenhuma fórmula financeira aqui.
const parse = s => new DOMParser().parseFromString(s, 'text/html').querySelector('x-dc > div');
const clone = n => document.importNode(n, true);
const num = v => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = v => (v < 0 ? '−' : '') + 'R$ ' + num(v);
const sinal = v => (v < 0 ? '−' : '+') + num(v);
const brlSinal = v => (v < 0 ? '−' : '+') + 'R$ ' + num(v);
const cor = v => v < 0 ? '#B3261E' : '#1C6B43';
const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
const pct = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2).replace('.', ',') + '%';
const ddmm = s => String(s || '').slice(0, 5);

// Etiqueta e linha de fonte por posição, conforme D007/D012 (texto, nunca selo de confirmação).
export function rotulosPosicao(l, semCdi) {
  const indiceSemTaxa = l.fonte === 'indice' && !l.exato && semCdi && ['CDI', 'SELIC'].includes(l.indexador);
  let etiqueta = null, ambar = false, fonte, curta;
  if (l.fonte === 'mercado') { etiqueta = 'cotação'; fonte = 'Fonte: cotação de mercado · ' + (l.tributacao === 'ACOES' ? 'IR só na venda, não estimado' : 'Resgate: prazo não informado'); curta = 'cotação · ' + plural(Number(l.quantidade.toFixed(4)), 'cota', 'cotas').replace('.', ','); }
  else if (l.fonte === 'manual') { etiqueta = 'manual · ' + plural(l.idade, 'dia', 'dias'); ambar = true; fonte = 'Valor parado há ' + plural(l.idade, 'dia', 'dias') + ': pode não ser o de hoje'; curta = 'manual · digitado há ' + plural(l.idade, 'dia', 'dias'); }
  else if (l.fonte === 'sem fonte') { etiqueta = 'sem fonte'; ambar = true; fonte = 'origem do valor não informada · data não informada'; curta = 'origem do valor não informada'; }
  else if (indiceSemTaxa) { etiqueta = 'sem fonte'; ambar = true; fonte = 'Fonte: origem do valor não informada · Resgate: prazo não informado'; curta = 'origem do valor não informada'; }
  else if (!l.exato) { etiqueta = 'aproximado'; fonte = 'Fonte: taxa aproximada (série indisponível) · Resgate: prazo não informado'; curta = 'aproximado · série indisponível'; }
  else { fonte = 'Fonte: série do BC · Resgate: prazo não informado'; curta = l.indexa + ' · série do BC'; }
  if (l.parcial) etiqueta = etiqueta ? 'parcial · ' + etiqueta : 'parcial';
  const contexto = l.fonte === 'sem fonte' ? (l.instituicao || '—') : l.fonte === 'manual' ? l.instituicao + ' · valor digitado em ' + (l.atualizadoEm || l.data)
    : [l.instituicao || '—', l.indexa, plural(l.dias, 'dia', 'dias')].join(' · ') + (l.fonte === 'indice' ? ' · desde ' + l.data : '');
  return { etiqueta, ambar, fonte, curta, contexto, semOrigem: etiqueta === 'sem fonte' };
}

function cardsKpi(s, mob, kpi) {
  const semOrigem = s.linhas.filter(l => rotulosPosicao(l, s.semCdi).semOrigem).length;
  const avisoOrigem = '';
  const linhaOrigem = semOrigem ? 'inclui ' + plural(semOrigem, 'valor sem origem informada', 'valores sem origem informada') : null;
  const impostoTxt = s.imposto > 0 ? '−' + brl(s.imposto) + ' de imposto estimado' : 'sem imposto a pagar';
  const dados = mob ? [
    ['Bruto hoje', brl(s.bruto), (s.algumAproximado ? 'alguma aproximada' : plural(s.n, 'posição', 'posições')) + avisoOrigem],
    ['Rendimento', brlSinal(s.ganho), (s.pct === null ? '—' : pct(s.pct)) + ' · aplicado ' + num(s.aplicado), cor(s.ganho)],
    ['Depois de IR e IOF', brl(s.liquido), (s.imposto > 0 ? 'imposto estimado −' + brl(s.imposto) : 'sem imposto a pagar') + ' · não diz quando dá para resgatar']
  ] : [
    ['Bruto hoje', brl(s.bruto), plural(s.n, 'posição', 'posições') + (s.algumAproximado ? ' · alguma aproximada' : '') + avisoOrigem],
    ['Aplicado', brl(s.aplicado), 'soma dos aportes'],
    ['Rendimento', brlSinal(s.ganho), s.pct === null ? '—' : pct(s.pct) + ' no período', cor(s.ganho)],
    ['Depois de IR e IOF', brl(s.liquido), impostoTxt + '. Não diz quando dá para resgatar.'],
    ['Já realizado', brlSinal(s.realizado), s.encerradas ? plural(s.encerradas, 'posição encerrada', 'posições encerradas') : 'em vendas parciais', cor(s.realizado)]
  ];
  const tpl = [...kpi.children];
  kpi.replaceChildren();
  for (const [i, [rot, val, sub, c]] of dados.entries()) {
    if (rot === 'Já realizado' && !(s.realizado !== 0 || s.encerradas)) continue;
    const n = clone(tpl[Math.min(i, tpl.length - 1)]);
    n.children[0].textContent = rot; n.children[1].textContent = val; n.children[2].textContent = sub;
    n.children[1].style.color = c || '#16171A';
    // D020: "inclui N valor(es) sem origem informada" em âmbar escuro, peso 600, abaixo do Bruto hoje.
    if (rot === 'Bruto hoje' && linhaOrigem) { const aviso = clone(n.children[2]); aviso.textContent = linhaOrigem; aviso.style.color = '#6B4300'; aviso.style.fontWeight = '600'; aviso.dataset.avisoOrigem = 'true'; if (mob && s.algumAproximado === false) n.children[2].remove(); n.append(aviso); }
    kpi.append(n);
  }
  if (!mob) kpi.style.gridTemplateColumns = 'repeat(' + kpi.children.length + ', minmax(0, 1fr))';
}

export function investimentosView(fontes, s, mob, acoes = {}) {
  const fluxo = s.fluxo, temPos = s.n > 0 && !s.erro;
  if (s.erro) return erroD012(fontes, s, mob, acoes);
  if (!temPos) return mob ? semPosicaoCelular(fontes, s, acoes) : semPosicaoD020(fontes, s);
  if (!mob) {
    const root = clone(parse(fontes.D007_Investimentos));
    root.style.width = '100%'; root.style.minHeight = '100vh'; root.style.height = 'auto';
    const main = root.querySelector('main'); main.style.height = 'auto';
    const [cab, kpi, posicoes, baixo, variantes] = main.children;
    variantes.remove();
    // D-022 (L-005): o selo explica o "—" de vs poupança; sem as duas referências, um texto só.
    cab.lastElementChild.textContent = !s.selo ? '' : s.semCdi && s.semPoup ? 'sem CDI nem poupança: série do BC fora do ar e Config vazia'
      : s.semPoup ? s.selo + ' · sem poupança para comparar' : s.selo;
    if (!s.selo || s.erro) cab.lastElementChild.remove();
    else if (s.semCdi || s.semPoup) cab.lastElementChild.style.cssText = SELO_SEM_CDI;
    if (s.releitura) main.insertBefore(faixaReleitura(fontes, s, false, acoes), kpi);
    const tbody = posicoes.querySelector('tbody'), modelos = [...tbody.children];
    if (temPos) {
      cardsKpi(s, false, kpi);
      tbody.replaceChildren();
      for (const l of s.linhas) {
        const r = rotulosPosicao(l, s.semCdi);
        // Modelo com etiqueta (linha 2) ou sem etiqueta (linha 1 = CDB) da prancha.
        const n = clone(modelos[r.etiqueta ? (r.ambar ? 3 : 1) : 0]);
        const th = n.querySelector('th').firstElementChild;
        if (r.etiqueta) { const nome = th.children[0]; nome.firstChild.textContent = l.produto + ' '; nome.lastElementChild.textContent = r.etiqueta; }
        else th.firstChild.textContent = l.produto + ' ';
        const linhas = [...th.children].slice(r.etiqueta ? 1 : 0);
        linhas[0].textContent = r.contexto; linhas[1].textContent = r.fonte;
        const td = n.querySelectorAll('td');
        td[0].textContent = num(l.aplicado); td[1].textContent = num(l.bruto);
        [[2, l.rend], [3, l.vsCdi], [4, l.vsPoup]].forEach(([i, v]) => { td[i].textContent = sinal(v); td[i].style.color = cor(v); });
        // P-L004-1: sem série e sem taxa da Config o motor compara contra zero; não é comparação real.
        if (s.semCdi) { td[3].textContent = '—'; td[3].style.color = '#4A4D55'; td[3].setAttribute('aria-label', 'sem CDI para comparar'); }
        // D-022 (adiado, conservador): sem série e sem poup_am o motor também compara contra zero.
        if (s.semPoup) { td[4].textContent = '—'; td[4].style.color = '#4A4D55'; td[4].setAttribute('aria-label', 'sem poupança para comparar'); }
        if (r.semOrigem && l.fonte === 'sem fonte') linhas[1].style.color = '#4A4D55';
        tbody.append(n);
      }
    } else {
      kpi.remove(); posicoes.remove();
      if (s.erro) {
        const alerta = clone(parse(fontes.D012_Investimentos).querySelector('section[role=alert]'));
        alerta.querySelector('span span').textContent = '(' + s.erro.status + ')';
        alerta.querySelector('span').firstChild.textContent = 'A base respondeu: “' + s.erro.mensagem + '” ';
        alerta.querySelector('button').onclick = acoes.tentar;
        main.insertBefore(alerta, baixo);
      } else if (!fluxo) {
        const vazio = clone(variantes.children[1]);
        vazio.replaceChildren(); vazio.textContent = 'Nenhum investimento registrado. Sem dados não é patrimônio zero.';
        vazio.setAttribute('role', 'status');
        main.insertBefore(vazio, baixo);
      }
    }
    preencherFluxo(baixo.children[0], fluxo, temPos, s);
    if (!fluxo) baixo.children[0].remove();
    if (!temPos && s.erro) { const nota = clone(baixo.lastElementChild.firstElementChild); nota.children[0].textContent = 'Já realizado'; nota.children[1].textContent = 'Depende das posições; volta junto com elas.'; baixo.lastElementChild.prepend(nota); }
    if (!fluxo) baixo.style.gridTemplateColumns = 'minmax(0, 1fr)';
    return root;
  }
  // Celular: tela aberta pelo Mais (moldura D011 3) com o conteúdo das duas colunas do D007_Celular.
  const moldura = molduraCelular(fontes, s.selo || '', s.semCdi, acoes.viaMais);
  const fonte = parse(fontes.D007_Celular);
  const [tela, continuacao] = [fonte.children[0], fonte.children[1]];
  const corpo = moldura.children[1];
  const [, kpi, lista, prazo] = [...tela.children].map(clone);
  if (acoes.viaMais && s.selo) { const sel = document.createElement('span'); sel.style.cssText = 'font-size: 12px; color: ' + (s.semCdi ? '#6B4300; font-weight: 600' : '#5D6068'); sel.textContent = s.selo; corpo.append(sel); }
  if (s.releitura) corpo.append(faixaReleitura(fontes, s, true, acoes));
  if (temPos) {
    cardsKpi(s, true, kpi); corpo.append(kpi);
    const modelo = lista.children[0];
    lista.replaceChildren();
    for (const l of s.linhas) {
      const r = rotulosPosicao(l, s.semCdi), n = clone(modelo);
      n.children[0].textContent = l.produto; n.children[1].textContent = num(l.bruto); n.children[2].textContent = r.curta;
      if (r.semOrigem) { const e = document.createElement('span'); e.style.cssText = ETIQUETA_AMBAR; e.textContent = 'sem fonte'; n.children[0].append(' ', e); }
      if (l.fonte === 'manual') n.children[2].style.color = '#6B4300';
      n.children[3].textContent = sinal(l.rend); n.children[3].style.color = cor(l.rend);
      lista.append(n);
    }
    corpo.append(lista, prazo);
  }
  const [titulo, periodo, bancos, alerta, realizado, pontos, nova] = [...continuacao.children].map(clone);
  if (fluxo) {
    titulo.setAttribute('role', 'heading'); titulo.setAttribute('aria-level', '2');
    periodo.textContent = (fluxo.periodo ? ddmm(fluxo.periodo[0]) + ' a ' + fluxo.periodo[1] + ' · ' : '') + 'não é quanto vale hoje';
    const modelo = bancos.children[0]; bancos.replaceChildren();
    for (const b of fluxo.porBanco) { const n = clone(modelo); n.children[0].textContent = b.banco; n.children[1].textContent = (b.liquido < 0 ? '−' : '') + num(b.liquido); n.children[2].textContent = 'aportado −' + num(b.aportado) + ' · resgatado +' + num(b.resgatado); bancos.append(n); }
    corpo.append(titulo, periodo, bancos);
    if (fluxo.resgateComoEntrada > 0) { alerta.firstChild.textContent = brl(fluxo.resgateComoEntrada) + ' de resgate está classificado como '; corpo.append(alerta); }
    if (!temPos && !s.erro) { const nota = document.createElement('span'); nota.style.cssText = prazo.style.cssText; nota.textContent = 'Isto é o que entrou e saiu, não quanto vale hoje. Registre a posição pelo Telegram para ver rendimento.'; corpo.append(nota); }
  }
  if (temPos && (s.realizado !== 0 || s.encerradas)) { realizado.children[1].textContent = brlSinal(s.realizado); realizado.children[1].style.color = cor(s.realizado); corpo.append(realizado); }
  corpo.append(pontos, nova);
  for (const n of corpo.children) n.style.flexShrink = '0';
  return moldura;
}

function preencherFluxo(sec, fluxo, temPos, s) {
  if (!fluxo) return;
  const [cab, desc, grade, alerta] = sec.children;
  cab.lastElementChild.textContent = fluxo.periodo ? fluxo.periodo[0] + ' a ' + fluxo.periodo[1] : '';
  const cels = [...grade.children], cabecalho = cels.slice(0, 4), modelo = cels.slice(4, 8);
  grade.replaceChildren(...cabecalho);
  for (const b of fluxo.porBanco) {
    const [n0, n1, n2, n3] = modelo.map(clone);
    n0.firstChild.textContent = b.banco + ' '; n0.lastElementChild.textContent = '· ' + plural(b.n, 'movimentação', 'movimentações');
    n1.textContent = '−' + num(b.aportado); n2.textContent = '+' + num(b.resgatado); n2.style.color = b.resgatado > 0 ? '#1C6B43' : ''; n3.textContent = (b.liquido < 0 ? '−' : '') + num(b.liquido);
    grade.append(n0, n1, n2, n3);
  }
  if (fluxo.resgateComoEntrada > 0) alerta.firstChild.textContent = brl(fluxo.resgateComoEntrada) + ' de resgate está classificado como ';
  else alerta.remove();
  if (!temPos && !s.erro) { const nota = document.createElement('span'); nota.style.cssText = desc.style.cssText; nota.textContent = 'Isto é o que entrou e saiu, não quanto vale hoje. Registre a posição pelo Telegram para ver rendimento.'; sec.append(nota); }
}

// D012_Investimentos / D012_Celular_2: posições falharam, fluxo do extrato mantido se carregou.
function erroD012(fontes, s, mob, acoes) {
  const fluxo = s.fluxo, periodo = fluxo?.periodo;
  const alertaTxt = el => { const sp = el.querySelector('span'); sp.textContent = sp.textContent.replace(/“[^”]*”\s*\(\d+\)/, '“' + s.erro.mensagem + '” (' + s.erro.status + ')'); };
  if (!mob) {
    const root = clone(parse(fontes.D012_Investimentos));
    root.style.width = '100%'; root.style.minHeight = '100vh'; root.style.height = 'auto';
    const main = root.querySelector('main'); main.style.height = 'auto'; main.querySelector('aside')?.remove();
    const conteudo = main.firstElementChild, [, alerta, secFluxo] = conteudo.children;
    const inner = alerta.querySelector('span span'); inner.textContent = '(' + s.erro.status + ')';
    alerta.querySelector('span').firstChild.textContent = 'A base respondeu: “' + s.erro.mensagem + '” ';
    alerta.querySelector('button').onclick = acoes.tentar;
    if (fluxo) {
      secFluxo.children[0].lastElementChild.textContent = 'vem do extrato, que carregou' + (periodo ? ' · ' + ddmm(periodo[0]) + ' a ' + periodo[1] : '');
      const tbody = secFluxo.querySelector('tbody'), modelo = tbody.firstElementChild; tbody.replaceChildren();
      for (const b of fluxo.porBanco) { const n = clone(modelo); n.querySelector('th').textContent = b.banco; const td = n.querySelectorAll('td'); td[0].textContent = '−' + num(b.aportado); td[1].textContent = '+' + num(b.resgatado); td[1].style.color = b.resgatado > 0 ? '#1C6B43' : ''; td[2].textContent = (b.liquido < 0 ? '−' : '') + num(b.liquido); tbody.append(n); }
    } else secFluxo.remove();
    return root;
  }
  const tela = clone(parse(fontes.D012_Celular_2).children[1]);
  const corpo = tela.children[1]; corpo.style.overflowY = 'auto'; corpo.style.minHeight = '0';
  const [alerta, titulo, sub, bancos] = corpo.children;
  alertaTxt(alerta); alerta.querySelector('button').onclick = acoes.tentar;
  if (fluxo) {
    titulo.setAttribute('role', 'heading'); titulo.setAttribute('aria-level', '2');
    sub.textContent = 'do extrato, que carregou' + (periodo ? ' · ' + ddmm(periodo[0]) + ' a ' + periodo[1] : '') + ' · não é quanto vale hoje';
    const modelo = bancos.children[0]; bancos.replaceChildren();
    for (const b of fluxo.porBanco) { const n = clone(modelo); n.children[0].textContent = b.banco; n.children[1].textContent = (b.liquido < 0 ? '−' : '') + num(b.liquido); n.children[2].textContent = 'aportado −' + num(b.aportado) + ' · resgatado +' + num(b.resgatado); bancos.append(n); }
  } else { titulo.remove(); sub.remove(); bancos.remove(); }
  for (const n of corpo.children) n.style.flexShrink = '0';
  return tela;
}

const SELO_SEM_CDI = 'font-size: 13px; padding: 8px 12px; border-radius: 999px; background: #FFF1D6; color: #6B4300; border: 1px solid #E8C98A; font-weight: 600';
const ETIQUETA_AMBAR = 'font-size: 11px; font-weight: 500; padding: 1px 7px; border-radius: 999px; background: #FFF1D6; color: #6B4300; border: 1px solid #E8C98A';
const hora = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const desembrulhar = raiz => { for (const n of [...raiz.querySelectorAll('sc-if')].reverse()) n.replaceWith(...n.childNodes); };

// D020: faixa "Mostrando a leitura de hoje" quando a releitura da mesma pessoa e período falhou.
function faixaReleitura(fontes, s, mob, acoes) {
  const r = s.releitura;
  const f = mob ? clone(parse(fontes.D020_Celular).children[3].querySelector('[role=alert]')) : clone(parse(fontes.D020_Investimentos).querySelector('sc-if[value="{{ v.banner }}"] [role=alert]'));
  const t = f.querySelector('span'); const b = t.querySelector('b');
  b.textContent = 'Mostrando a leitura de hoje, ' + hora(r.lida) + '.';
  t.replaceChildren(b, ' A releitura das ' + hora(r.falhou) + ' falhou: “' + r.mensagem + '”. Estes números podem estar desatualizados.');
  f.querySelector('button').onclick = acoes.tentar;
  return f;
}

function molduraCelular(fontes, subtitulo, ambar, viaMais) {
  const tela = clone(parse(fontes.D020_Celular).children[3]);
  const corpo = tela.children[1]; corpo.replaceChildren(); corpo.style.overflowY = 'auto'; corpo.style.minHeight = '0';
  if (viaMais) tela.querySelector('header').replaceWith(clone(parse(fontes.D011_Mais_Celular).children[2].querySelector('header')));
  else { const sub = tela.querySelector('header span span'); sub.textContent = subtitulo; sub.style.cssText = 'font-size: 12px; ' + (ambar ? 'color: #6B4300; font-weight: 600' : 'color: #5D6068'); }
  return tela;
}

function tabelaFluxo(tbody, fluxo) {
  const [m1, m2] = [...tbody.children]; tbody.replaceChildren();
  fluxo.porBanco.forEach((b, i) => {
    const n = clone(i === fluxo.porBanco.length - 1 ? m2 : m1);
    n.querySelector('th').firstChild.textContent = b.banco + ' '; n.querySelector('th span').textContent = '· ' + plural(b.n, 'movimentação', 'movimentações');
    const td = n.querySelectorAll('td'); td[0].textContent = '−' + num(b.aportado); td[1].textContent = '+' + num(b.resgatado); td[1].style.color = b.resgatado > 0 ? '#1C6B43' : ''; td[2].textContent = (b.liquido < 0 ? '−' : '') + num(b.liquido);
    tbody.append(n);
  });
}

// D020 1440: sem posição com fluxo, ou nada registrado.
function semPosicaoD020(fontes, s) {
  // Só a tela (navegação + conteúdo); o seletor de estados da prancha não é produto.
  const root = clone(parse(fontes.D020_Investimentos).querySelector('nav').parentElement);
  root.style.width = '100%'; root.style.minHeight = '100vh'; root.style.height = 'auto';
  const main = root.querySelector('main');
  for (const v of ['v.banner', 'v.posicoes']) for (const n of main.querySelectorAll('sc-if[value="{{ ' + v + ' }}"]')) n.remove();
  const nada = main.querySelector('sc-if[value="{{ v.nada }}"]'), sec = main.querySelector('sc-if[value="{{ v.fluxo }}"]');
  if (s.fluxo) {
    nada.remove();
    const f = sec.querySelector('section'); f.querySelector('h2').nextElementSibling.textContent = s.fluxo.periodo ? s.fluxo.periodo[0] + ' a ' + s.fluxo.periodo[1] : '';
    tabelaFluxo(f.querySelector('tbody'), s.fluxo);
    const alerta = f.lastElementChild;
    if (s.fluxo.resgateComoEntrada > 0) alerta.firstChild.textContent = brl(s.fluxo.resgateComoEntrada) + ' de resgate está classificado como '; else alerta.remove();
  } else sec.remove();
  desembrulhar(root);
  return root;
}

// D020 390: sem posição com fluxo (tela 1) ou nada registrado (tela 2).
function semPosicaoCelular(fontes, s, acoes) {
  const fonte = parse(fontes.D020_Celular);
  const modelo = clone(fonte.children[s.fluxo ? 0 : 1]);
  const tela = molduraCelular(fontes, s.fluxo ? 'sem posição registrada' : 'nada registrado', false, acoes.viaMais);
  const corpo = tela.children[1], partes = [...modelo.children[1].children];
  if (s.fluxo) {
    const [titulo, periodo, nota, bancos, alerta, ...resto] = partes;
    titulo.setAttribute('role', 'heading'); titulo.setAttribute('aria-level', '2');
    periodo.textContent = s.fluxo.periodo ? s.fluxo.periodo[0] + ' a ' + s.fluxo.periodo[1] : '';
    const [m1, m2] = [...bancos.children]; bancos.replaceChildren();
    s.fluxo.porBanco.forEach((b, i) => { const n = clone(i ? m2 : m1); n.children[0].textContent = b.banco; n.children[1].textContent = (b.liquido < 0 ? '−' : '') + num(b.liquido); n.children[2].textContent = 'aportado −' + num(b.aportado) + ' · resgatado +' + num(b.resgatado); bancos.append(n); });
    corpo.append(titulo, periodo, nota, bancos);
    if (s.fluxo.resgateComoEntrada > 0) { alerta.firstChild.textContent = brl(s.fluxo.resgateComoEntrada) + ' de resgate está classificado como '; corpo.append(alerta); }
    corpo.append(...resto);
  } else corpo.append(...partes);
  for (const n of corpo.children) n.style.flexShrink = '0';
  return tela;
}
