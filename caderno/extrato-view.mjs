// D009 (computador) e D010 (celular/intermediário): clona as fontes aprovadas. A lista é o resultado
// do renderTransacoes original (filtro, busca sem acento e ordem); aqui só agrupamos por dia para exibir.
const parse = s => new DOMParser().parseFromString(s, 'text/html').querySelector('x-dc > div');
const clone = n => document.importNode(n, true);
const num = v => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const ESTADO = /\s+·\s+(em processamento)$/i; // mesmo padrão de ESTADO_NA_DESC do painel
const VERDE = '#1C6B43';
const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);

export function agruparPorDia(txs) {
  const grupos = [];
  for (const r of txs) {
    let g = grupos.at(-1);
    if (!g || g.data !== r.data) grupos.push(g = { data: r.data, itens: [], movimento: 0 });
    g.itens.push(r); g.movimento += (r.credito || 0) - (r.debito || 0);
  }
  for (const g of grupos) g.movimento = Math.round(g.movimento * 100) / 100;
  return grupos;
}
const rotuloDia = d => { const [dd, mm, aa] = d.split('/').map(Number); const x = new Date(aa, mm - 1, dd); return Number.isNaN(x.getTime()) ? d || 'sem data' : SEMANA[x.getDay()] + ', ' + d.slice(0, 5); };
export function filtrosAtivos(f) { return (f.direcao ? 1 : 0) + (f.conta ? 1 : 0); }
const nomeDirecao = d => d === 'Débito' ? 'Saídas' : d === 'Crédito' ? 'Entradas' : 'Todas';
export function resumoTexto(s) {
  const base = s.periodo === 'fatura' ? 'Fatura com vencimento em ' + s.ms + ' · inclui compras de meses anteriores' : 'Competência ' + s.ms;
  return { base, n: plural(s.txs.length, 'movimentação', 'movimentações'), entradas: '+R$ ' + num(s.creditos), saidas: '−R$ ' + num(s.debitos) };
}
function textoVazio(s, f) {
  if (s.total) return 'Nenhuma movimentação com esses filtros. Há ' + s.total + ' no período; tire um filtro para vê-las.';
  return 'Nenhuma movimentação ' + (s.periodo === 'fatura' ? 'com vencimento da fatura em ' : 'na competência ') + s.ms + '. Sem dados não é mês sem gastos.';
}
const nomeSemEstado = r => r.desc.replace(ESTADO, '');
const produtoTxt = p => p === 'cartao' ? 'cartão' : p;

export function extratoView(fontes, s, f, largura, estado = {}, acoes = {}) {
  return largura >= 1024 ? extratoDesktop(fontes, s, f, largura, estado, acoes) : largura >= 600 ? extratoTablet(fontes, s, f, estado, acoes) : extratoCelular(fontes, s, f, largura, estado, acoes);
}

function linhaDesktop(r, modelos, acoes, largura, aberta) {
  const [mOriginal, mInterno, mSelo, mCredito, mSimples] = modelos;
  const n = clone(mSimples);
  const nome = n.children[0];
  nome.firstElementChild.textContent = nomeSemEstado(r);
  if (ESTADO.test(r.desc)) { nome.firstElementChild.append(' ', clone(mSelo.children[0].children[0].lastElementChild)); }
  if (r.descOriginal && r.descOriginal !== nomeSemEstado(r) && r.descOriginal !== r.desc) { const o = clone(mOriginal.children[0].lastElementChild); o.textContent = 'original: ' + r.descOriginal; nome.append(o); }
  if (r.consideraGasto === false) nome.append(clone(mInterno.children[0].lastElementChild));
  n.children[1].textContent = r.rotulo || r.cat;
  n.children[2].textContent = r.banco + ' · ' + produtoTxt(r.produto);
  const credito = r.credito > 0;
  n.children[3].textContent = (credito ? '+' : '−') + 'R$ ' + num(credito ? r.credito : r.debito);
  n.children[3].style.color = credito ? mCredito.children[3].style.color || VERDE : mSimples.children[3].style.color;
  n.dataset.operacao = r.id; n.setAttribute('aria-label', nomeSemEstado(r) + ', ' + n.children[3].textContent + ', abrir detalhe');
  n.onclick = () => acoes.operacao(r.id);
  // D017: colunas por largura; com o painel ao lado (≥1280) a lista cai para 3 colunas e banco·produto vira 2ª linha.
  n.setAttribute('aria-expanded', String(aberta === r.id)); n.setAttribute('aria-controls', 'painel-operacao');
  if (aberta && largura >= 1280) {
    n.style.gridTemplateColumns = 'minmax(0, 1fr) 170px 130px';
    const banco = n.children[2]; banco.remove(); const l = document.createElement('span'); l.style.cssText = 'font-size: 12px; color: #4A4D55'; l.textContent = banco.textContent; nome.append(l);
  } else if (largura < 1280) n.style.gridTemplateColumns = 'minmax(0, 1fr) 150px 160px 120px';
  if (aberta === r.id) Object.assign(n.style, { width: 'calc(100% + 28px)', margin: '0 -14px', padding: '8px 12px', background: '#F4F3EF', borderLeft: '2px solid #16171A', borderRight: '2px solid #16171A' });
  return n;
}

function extratoDesktop(fontes, s, f, largura, estado, acoes) {
  const root = clone(parse(fontes.D009_Extrato));
  root.style.width = '100%'; root.style.minHeight = '100vh'; root.style.height = 'auto';
  const main = root.querySelector('main'); main.style.height = 'auto';
  const [titulo, controles, resumo, alerta, sec1, sec2, nota] = main.children;
  const mesNome = MESES[s.mes.m - 1];
  titulo.firstElementChild.textContent = 'Tudo o que entrou e saiu · ' + mesNome + ' de ' + s.mes.y;
  const [mes, base, direcao, conta, busca] = controles.children;
  mes.children[1].textContent = mesNome[0].toUpperCase() + mesNome.slice(1) + ' de ' + s.mes.y;
  mes.children[0].onclick = () => acoes.mes(-1); mes.children[2].onclick = () => acoes.mes(1);
  // Estilo pressionado/solto copiado dos próprios botões da prancha (o 1º de cada grupo é o pressionado).
  const botoes = (grupo, valores, atual, acao) => { const ref = [...grupo.children].map(clone); [...grupo.children].forEach((b, i) => {
    const sel = valores[i] === atual; b.style.cssText = ref[sel ? 0 : 1].style.cssText; b.setAttribute('aria-pressed', String(sel)); b.onclick = () => acao(valores[i]);
  }); };
  botoes(base, ['mes', 'fatura'], s.periodo, acoes.periodo);
  botoes(direcao, ['', 'Débito', 'Crédito'], f.direcao, acoes.direcao);
  const sel = conta.querySelector('select');
  sel.replaceChildren();
  for (const [v, t] of [['', 'Todas'], ...s.contas.map(c => [c, c])]) { const o = document.createElement('option'); o.value = v; o.textContent = t; o.selected = v === f.conta; sel.append(o); }
  if (f.conta && !s.contas.includes(f.conta)) { const o = document.createElement('option'); o.value = f.conta; o.textContent = f.conta; o.selected = true; sel.append(o); }
  sel.onchange = () => acoes.conta(sel.value);
  const input = busca.querySelector('input'); input.value = f.busca; input.oninput = () => acoes.busca(input.value);
  const r = resumoTexto(s);
  resumo.setAttribute('aria-live', 'polite'); resumo.id = 'resumo-extrato'; resumo.tabIndex = -1;
  resumo.firstChild.textContent = r.base + ' · ' + r.n + ' · '; resumo.children[0].textContent = r.entradas; resumo.children[1].textContent = r.saidas;
  if (!s.txs.length) resumo.replaceChildren(r.base + ' · ' + r.n);
  if (!s.incompleto) alerta.remove();
  const modelos = [...sec1.children[1].children, ...sec2.children[1].children];
  const lista = document.createElement('div'); lista.style.cssText = 'display: contents';
  sec1.remove(); sec2.remove();
  if (estado.erro) {
    const e = clone(parse(fontes.D009_Celular).children[1].children[5]); e.querySelector('button').onclick = acoes.tentar; main.insertBefore(e, nota);
  } else if (!s.txs.length && s.total) {
    // D017: filtro sem resultado no computador — "Limpar filtros" só com direção ou conta ativas.
    const c = clone(parse(fontes.D017_Main).querySelector('sc-if[value="{{ vazio }}"] div')); c.setAttribute('role', 'status');
    c.querySelector('span span').textContent = textoVazio(s, f);
    const b = c.querySelector('button'); if (filtrosAtivos(f)) { b.onclick = acoes.limparDesktop; b.dataset.limpar = 'true'; } else b.remove();
    main.insertBefore(c, nota);
  } else if (!s.txs.length) {
    const v = clone(parse(fontes.D009_Celular).children[1].children[2]); v.replaceChildren(); v.textContent = textoVazio(s, f); v.setAttribute('role', 'status'); main.insertBefore(v, nota);
  } else for (const g of agruparPorDia(s.txs)) {
    const sec = clone(sec1);
    const cab = sec.children[0];
    cab.children[0].textContent = rotuloDia(g.data);
    cab.children[1].lastElementChild.textContent = (g.movimento < 0 ? '−' : g.movimento > 0 ? '+' : '') + 'R$ ' + num(g.movimento);
    sec.children[1].replaceChildren(...g.itens.map(x => linhaDesktop(x, modelos, acoes, largura, estado.aberta)));
    main.insertBefore(sec, nota);
  }
  nota.textContent = 'Sem saldo por dia: o extrato não traz o saldo histórico da conta, e a soma de gastos não é saldo. Clique numa linha para o detalhe, somente leitura.';
  return root;
}

function extratoCelular(fontes, s, f, largura, estado, acoes) {
  const fonte = parse(fontes.D010_Filtros_Celular);
  const tela = clone(fonte.children[0]);
  tela.style.width = '100%'; tela.style.height = '100vh';
  const [header, corpo] = tela.children;
  const mesNome = MESES[s.mes.m - 1];
  header.firstElementChild.firstElementChild.textContent = mesNome + ' de ' + s.mes.y;
  corpo.style.overflowY = 'auto'; corpo.style.minHeight = '0';
  const filhos = [...corpo.children];
  const [mes, base, buscaLinha, chips, resumo, cabDia, linhas] = filhos;
  mes.children[1].textContent = mesNome[0].toUpperCase() + mesNome.slice(1) + ' de ' + s.mes.y;
  mes.children[0].onclick = () => acoes.mes(-1); mes.children[2].onclick = () => acoes.mes(1);
  const refBase = [...base.children].map(clone);
  [...base.children].forEach((b, i) => { const v = ['mes', 'fatura'][i], on = v === s.periodo; b.style.cssText = refBase[on ? 0 : 1].style.cssText; b.setAttribute('aria-pressed', String(on)); b.onclick = () => acoes.periodo(v); });
  const input = buscaLinha.querySelector('input'); input.value = f.busca; input.oninput = () => acoes.busca(input.value);
  const botaoFiltros = buscaLinha.querySelector('button'); const nAtivos = filtrosAtivos(f);
  botaoFiltros.textContent = nAtivos ? 'Filtros · ' + nAtivos : 'Filtros'; botaoFiltros.dataset.filtros = 'true';
  for (const k of ['outline', 'outline-offset', 'box-shadow']) botaoFiltros.style.removeProperty(k); // anel desenhado da prancha não é estado de produto
  botaoFiltros.setAttribute('aria-expanded', String(!!estado.folha)); botaoFiltros.onclick = acoes.abrirFolha;
  const [chipModelo, , limpar] = chips.children;
  chips.replaceChildren();
  const ativos = [f.direcao ? ['direcao', nomeDirecao(f.direcao)] : null, f.conta ? ['conta', f.conta] : null].filter(Boolean);
  for (const [k, nome] of ativos) { const c = clone(chipModelo); c.textContent = nome + ' ×'; c.setAttribute('aria-label', 'Tirar filtro ' + nome); c.dataset.chip = k; c.onclick = () => acoes.tirar(k); chips.append(c); }
  if (ativos.length) { const l = clone(limpar); l.onclick = acoes.limpar; l.dataset.limpar = 'true'; chips.append(l); } else chips.remove();
  const r = resumoTexto(s);
  resumo.setAttribute('aria-live', 'polite'); resumo.dataset.resumo = 'true';
  resumo.firstChild.textContent = r.base + ' · ' + r.n + ' · ';
  const saidas = resumo.lastElementChild; saidas.textContent = r.saidas;
  if (s.creditos) { const e = clone(saidas); e.textContent = r.entradas; e.style.color = VERDE; resumo.insertBefore(e, saidas); resumo.insertBefore(document.createTextNode(' · '), saidas); }
  const modelos = [...linhas.children];
  for (const n of filhos.slice(5)) n.remove();
  if (estado.erro) { const e = clone(parse(fontes.D009_Celular).children[1].children[5]); e.querySelector('button').onclick = acoes.tentar; corpo.append(e); }
  else if (s.incompleto) { const a = clone(parse(fontes.D009_Celular).children[1].children[3]); a.setAttribute('role', 'status'); corpo.append(a); }
  if (!estado.erro && !s.txs.length) {
    const a = clone(parse(fontes.D010_Filtros_Celular).children[2].children[s.total ? 1 : 2]);
    a.replaceChildren(); a.setAttribute('role', 'status'); a.textContent = textoVazio(s, f);
    if (s.total && ativos.length) { const b = clone(parse(fontes.D010_Filtros_Celular).children[2].children[1].querySelector('button')); b.onclick = acoes.limpar; b.dataset.limpar = 'true'; a.append(document.createElement('br'), b); }
    corpo.append(a);
  } else if (!estado.erro) for (const g of agruparPorDia(s.txs)) {
    const c = clone(cabDia); c.children[0].textContent = rotuloDia(g.data); c.children[1].textContent = (g.movimento < 0 ? '−' : g.movimento > 0 ? '+' : '') + num(g.movimento);
    const l = clone(linhas); l.replaceChildren();
    for (const x of g.itens) {
      const selo = ESTADO.test(x.desc), interno = x.consideraGasto === false;
      const n = clone(modelos[selo ? 2 : interno ? 1 : 0]);
      n.children[0].children[0].textContent = nomeSemEstado(x);
      n.children[0].children[1].textContent = selo ? 'em processamento' : interno ? 'não conta como gasto' : (x.rotulo || x.cat) + ' · ' + produtoTxt(x.produto);
      const credito = x.credito > 0;
      n.children[1].textContent = (credito ? '+' : '−') + num(credito ? x.credito : x.debito); if (credito) n.children[1].style.color = VERDE;
      n.dataset.operacao = x.id; n.setAttribute('aria-label', nomeSemEstado(x) + ', ' + n.children[1].textContent + ', abrir detalhe');
      n.onclick = () => acoes.operacao(x.id); l.append(n);
    }
    corpo.append(c, l);
  }
  for (const n of corpo.children) n.style.flexShrink = '0';
  if (estado.folha) tela.append(folhaFiltros(fontes, s, f, largura, acoes));
  return tela;
}

function folhaFiltros(fontes, s, f, largura, acoes) {
  const fonte = parse(fontes.D010_Filtros_Celular).children[1];
  const [, scrimSrc, dialogoSrc] = fonte.children;
  const camada = document.createElement('div');
  camada.style.cssText = 'position: fixed; inset: 0; z-index: 50';
  const scrim = clone(scrimSrc); scrim.style.position = 'absolute'; scrim.style.inset = '0'; scrim.onclick = acoes.fecharFolha;
  const d = clone(dialogoSrc);
  if (largura >= 600) { Object.assign(d.style, { position: 'absolute', top: '0', right: '0', bottom: '0', left: 'auto', width: '360px', boxSizing: 'border-box', maxHeight: 'none', borderRadius: '0', boxShadow: '-8px 0 24px rgba(22,23,26,0.2)' }); }
  else Object.assign(d.style, { position: 'absolute', left: '0', right: '0', bottom: '0', top: 'auto', maxHeight: '85vh', overflowY: 'auto' });
  if (largura >= 600) d.firstElementChild.remove();
  const h = d.querySelector('h2'); h.tabIndex = -1; for (const k of ['outline', 'outline-offset', 'box-shadow']) h.style.removeProperty(k);
  d.querySelector('button[aria-label="Fechar filtros"]').onclick = acoes.fecharFolha;
  const [fsDir, fsConta] = d.querySelectorAll('fieldset');
  const grupoDir = fsDir.children[1], [lOff, lOn] = [grupoDir.children[0], grupoDir.children[1]];
  grupoDir.replaceChildren(...[['', 'Todas'], ['Débito', 'Saídas'], ['Crédito', 'Entradas']].map(([v, t]) => {
    const l = clone(v === f.direcao ? lOn : lOff); const i = l.querySelector('input'); i.checked = v === f.direcao; i.name = 'filtro-direcao'; i.value = v;
    l.lastChild.textContent = t; i.onchange = () => acoes.direcao(v, 'filtro-direcao'); return l;
  }));
  const contaLabels = [...fsConta.querySelectorAll('label')], [cOff, cOn] = [contaLabels[0], contaLabels[1]], notaConta = fsConta.querySelector('span');
  for (const l of contaLabels) l.remove();
  if (s.contas.length) {
    for (const [v, t] of [['', 'Todas as contas e cartões'], ...s.contas.map(c => [c, c])]) {
      const l = clone(v === f.conta ? cOn : cOff); const i = l.querySelector('input'); i.checked = v === f.conta; i.name = 'filtro-conta'; i.value = v;
      l.lastChild.textContent = t; i.onchange = () => acoes.conta(v, 'filtro-conta'); fsConta.insertBefore(l, notaConta);
    }
  } else { notaConta.textContent = 'Nenhuma conta ou cartão com movimentação neste período.'; }
  const [bLimpar, bVer] = d.lastElementChild.children;
  bLimpar.onclick = acoes.limpar; bVer.textContent = 'Ver ' + plural(s.txs.length, 'movimentação', 'movimentações'); bVer.onclick = acoes.fecharFolha;
  d.dataset.folha = 'true';
  d.onkeydown = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); acoes.fecharFolha(); return; }
    if (e.key !== 'Tab') return;
    const fechar = d.querySelector('button[aria-label="Fechar filtros"]'), ativo = d.getRootNode().activeElement;
    if (!e.shiftKey && ativo === bVer) { e.preventDefault(); fechar.focus(); }
    else if (e.shiftKey && (ativo === fechar || ativo === h)) { e.preventDefault(); bVer.focus(); }
  };
  camada.append(scrim, d);
  return camada;
}

// D019: 600–1023 usa a lista do celular em largura fluida, com a moldura e as linhas da prancha de 768.
function extratoTablet(fontes, s, f, estado, acoes) {
  const root = clone(parse(fontes.D019_768));
  Object.assign(root.style, { width: '100%', height: '100vh' });
  const [header, corpo] = root.children;
  const mesNome = MESES[s.mes.m - 1];
  header.firstElementChild.firstElementChild.textContent = 'Tudo o que entrou e saiu · ' + mesNome + ' de ' + s.mes.y;
  Object.assign(corpo.style, { overflowY: 'auto', minHeight: '0' });
  const [controles, resumo, ...secoes] = [...corpo.children];
  const [mes, base, busca, botaoFiltros] = controles.children;
  mes.querySelector('b').textContent = mesNome[0].toUpperCase() + mesNome.slice(1) + ' de ' + s.mes.y;
  mes.querySelector('[aria-label="Mês anterior"]').onclick = () => acoes.mes(-1); mes.querySelector('[aria-label="Próximo mês"]').onclick = () => acoes.mes(1);
  const refBase = [...base.children].map(clone);
  [...base.children].forEach((b, i) => { const v = ['mes', 'fatura'][i], on = v === s.periodo; b.style.cssText = refBase[on ? 0 : 1].style.cssText; b.setAttribute('aria-pressed', String(on)); b.onclick = () => acoes.periodo(v); });
  const input = busca.querySelector('input'); input.value = f.busca; input.oninput = () => acoes.busca(input.value);
  const nAtivos = filtrosAtivos(f);
  botaoFiltros.textContent = nAtivos ? 'Filtros · ' + nAtivos : 'Filtros'; botaoFiltros.dataset.filtros = 'true';
  botaoFiltros.setAttribute('aria-expanded', String(!!estado.folha)); botaoFiltros.onclick = acoes.abrirFolha;
  const r = resumoTexto(s); resumo.dataset.resumo = 'true';
  resumo.firstChild.textContent = r.base + ' · ' + r.n + ' · '; resumo.children[0].textContent = r.entradas; resumo.children[1].textContent = r.saidas;
  if (!s.txs.length) resumo.replaceChildren(r.base + ' · ' + r.n);
  const modeloSec = secoes[0], tpl = [...modeloSec.children[1].children];
  for (const n of secoes) n.remove();
  // Chips (D010): um por filtro ativo + "limpar filtros", logo abaixo dos controles.
  const ativos = [f.direcao ? ['direcao', nomeDirecao(f.direcao)] : null, f.conta ? ['conta', f.conta] : null].filter(Boolean);
  if (ativos.length) {
    const fonteChips = parse(fontes.D010_Filtros_Celular).children[0].children[1].children[3];
    const chips = clone(fonteChips); const [chipModelo, , limpar] = [...chips.children]; chips.replaceChildren();
    for (const [k, nome] of ativos) { const c = clone(chipModelo); c.textContent = nome + ' ×'; c.setAttribute('aria-label', 'Tirar filtro ' + nome); c.dataset.chip = k; c.onclick = () => acoes.tirar(k); chips.append(c); }
    const l = clone(limpar); l.onclick = acoes.limpar; l.dataset.limpar = 'true'; chips.append(l);
    corpo.insertBefore(chips, resumo);
  }
  if (estado.erro) { const e = clone(parse(fontes.D009_Celular).children[1].children[5]); e.querySelector('button').onclick = acoes.tentar; corpo.append(e); }
  else if (s.incompleto) { const a = clone(parse(fontes.D009_Celular).children[1].children[3]); a.setAttribute('role', 'status'); corpo.append(a); }
  if (!estado.erro && !s.txs.length) {
    const a = clone(parse(fontes.D010_Filtros_Celular).children[2].children[s.total ? 1 : 2]);
    a.replaceChildren(); a.setAttribute('role', 'status'); a.textContent = textoVazio(s, f);
    if (s.total && ativos.length) { const b = clone(parse(fontes.D010_Filtros_Celular).children[2].children[1].querySelector('button')); b.onclick = acoes.limpar; b.dataset.limpar = 'true'; a.append(document.createElement('br'), b); }
    corpo.append(a);
  } else if (!estado.erro) for (const g of agruparPorDia(s.txs)) {
    const sec = clone(modeloSec), cab = sec.children[0], cartao = sec.children[1];
    cab.querySelector('h2').textContent = rotuloDia(g.data);
    cab.lastElementChild.lastElementChild.textContent = (g.movimento < 0 ? '−' : g.movimento > 0 ? '+' : '') + 'R$ ' + num(g.movimento);
    cartao.replaceChildren(...g.itens.map((x, i) => linhaTablet(x, tpl, i === 0, acoes, estado.aberta)));
    corpo.append(sec);
  }
  for (const n of corpo.children) n.style.flexShrink = '0';
  if (estado.folha) root.append(folhaFiltros(fontes, s, f, 768, acoes));
  return root;
}

function linhaTablet(x, tpl, primeira, acoes, aberta) {
  const [mOriginal, mInterno, mSelo] = tpl;
  const n = clone(mOriginal);
  n.style.outline = ''; n.style.outlineOffset = ''; n.style.borderRadius = '';
  n.style.borderTop = primeira ? '0' : mInterno.style.borderTop;
  const bloco = n.children[0], [nome, original, meta] = [...bloco.children];
  nome.textContent = nomeSemEstado(x);
  if (ESTADO.test(x.desc)) nome.append(' ', clone(mSelo.children[0].children[0].lastElementChild));
  if (x.descOriginal && x.descOriginal !== nomeSemEstado(x) && x.descOriginal !== x.desc) original.textContent = 'original: ' + x.descOriginal; else original.remove();
  meta.textContent = (x.rotulo || x.cat) + ' · ' + x.banco + ' · ' + produtoTxt(x.produto);
  if (x.consideraGasto === false) bloco.append(clone(mInterno.children[0].lastElementChild));
  const credito = x.credito > 0, v = n.children[1];
  v.textContent = (credito ? '+' : '−') + 'R$ ' + num(credito ? x.credito : x.debito); if (credito) v.style.color = VERDE;
  n.dataset.operacao = x.id; n.setAttribute('aria-label', nomeSemEstado(x) + ', ' + v.textContent + ', abrir detalhe');
  n.setAttribute('aria-expanded', String(aberta === x.id)); n.setAttribute('aria-controls', 'painel-operacao');
  n.onclick = () => acoes.operacao(x.id);
  return n;
}
