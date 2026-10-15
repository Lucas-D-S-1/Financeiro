// D008 (+ D012_Hoje): clona as fontes aprovadas. Saldos vêm de lerSaldosInformados; projeção e
// eventos vêm da análise recebida; últimos lançamentos são a lista que o motor já montou.
const parse = s => new DOMParser().parseFromString(s, 'text/html').querySelector('x-dc > div');
const clone = n => document.importNode(n, true);
const num = v => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = v => (v < 0 ? '−' : '') + 'R$ ' + num(v);
const p2 = n => String(n).padStart(2, '0');
const ddmm = d => p2(d.getDate()) + '/' + p2(d.getMonth() + 1);
const ddmmaaaa = d => ddmm(d) + '/' + d.getFullYear();
const isoDdmm = s => s.slice(8, 10) + '/' + s.slice(5, 7);
const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ESTADO = /\s+·\s+(em processamento)$/i; // mesmo padrão de ESTADO_NA_DESC do painel
const isoLocal = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const conta = c => c.banco + ' · ' + c.produto;
const negrito = (pai, ...partes) => { pai.replaceChildren(); for (const p of partes) { if (Array.isArray(p)) { const b = document.createElement('b'); b.textContent = p[0]; pai.append(b); } else pai.append(p); } };

export function sinaisAtencao(h, saldos) {
  const s = [];
  if (h.emAberto.length) s.push({ tipo: 'cobertura', titulo: 'Cobertura parcial em ' + MESES[h.mes.m - 1] + ':', texto: ' fatura do ' + h.emAberto.join(' e do ') + ' incompleta nesta base.', curto: 'cobertura parcial em ' + MESES[h.mes.m - 1] });
  for (const c of saldos.contas.filter(c => c.antigo)) s.push({ tipo: 'antigo', titulo: 'Saldo antigo:', texto: ' ' + c.banco + ' informado há ' + plural(c.idade, 'dia', 'dias') + '.', curto: 'saldo do ' + c.banco.replace(/^Banco /, '') + ' com ' + plural(c.idade, 'dia', 'dias') });
  for (const c of saldos.semData) s.push({ tipo: 'semdata', titulo: 'Saldo sem data:', texto: ' ' + c.banco + '. Não dá para dizer se é de hoje.', curto: c.banco + ' sem data' });
  for (const c of saldos.semValor) s.push({ tipo: 'semsaldo', titulo: 'Sem saldo:', texto: ' ' + conta(c) + '.', curto: c.banco + ' sem saldo' });
  if (h.incompleto) s.push({ tipo: 'incompleto', titulo: 'Movimentações incompletas:', texto: ' parte das movimentações não chegou nesta leitura.', curto: 'movimentações incompletas' });
  return s;
}

function textoTotal(saldos, mob) {
  if (saldos.total) return mob ? ['Total ' + brl(saldos.total.valor) + ' · soma de ' + plural(saldos.total.n, 'conta', 'contas') + ' · dado mais antigo: ' + ddmm(saldos.total.maisAntiga)]
    : [['Total ' + brl(saldos.total.valor)], ' · soma de ' + plural(saldos.total.n, 'conta', 'contas') + ' · dado mais antigo: ' + ddmm(saldos.total.maisAntiga) + '.'];
  if (saldos.nenhum) return ['Nenhuma fonte informou saldo ainda. Isso não quer dizer conta zerada.'];
  if (mob) return ['Sem total: ' + [saldos.semValor.length ? (saldos.semValor.length === 1 ? 'falta um saldo' : 'faltam ' + saldos.semValor.length + ' saldos') : '', saldos.semData.length ? plural(saldos.semData.length, 'saldo sem data', 'saldos sem data') : ''].filter(Boolean).join(' e ') + '.'];
  if (!saldos.semData.length) return ['Sem total: falta o saldo de ', [saldos.semValor.map(conta).join(', ')], '. Quando todas as contas tiverem saldo, a soma aparece aqui, com a data mais antiga.'];
  const partes = ['Sem total: '];
  saldos.semData.forEach((c, i) => partes.push(i ? ' e o do ' : 'o saldo do ', [c.banco]));
  partes.push(saldos.semData.length === 1 ? ' não tem data' : ' não têm data');
  saldos.semValor.forEach((c, i) => partes.push(i ? ' e do ' : ' e falta o saldo do ', [c.banco]));
  partes.push('. A soma só aparece com todos os saldos e todas as datas.');
  return partes;
}

function cartaoSaldo(modelos, c, mob) {
  if (mob) {
    const n = clone(modelos[c.valor === null ? 2 : c.antigo ? 1 : 0]);
    n.children[0].textContent = conta(c);
    n.children[1].textContent = c.valor === null ? '—' : brl(c.valor);
    n.children[2].textContent = c.estado === 'ausente' ? 'sem saldo informado' : c.estado === 'vazio' ? 'saldo veio vazio; não é R$ 0,00'
      : !c.data ? 'data não informada · ' + (c.fonte || 'fonte não informada')
      : ddmm(c.data) + (c.temHora ? ' ' + p2(c.data.getHours()) + ':' + p2(c.data.getMinutes()) : '') + (c.antigo ? ' · há ' + plural(c.idade, 'dia', 'dias') : '');
    return n;
  }
  const [normal, antigo, ausente, semData, vazio] = modelos;
  const n = clone(c.estado === 'ausente' ? ausente : c.estado === 'vazio' ? vazio : !c.data ? semData : c.antigo ? antigo : normal);
  n.children[0].textContent = conta(c);
  n.children[1].textContent = c.valor === null ? '—' : brl(c.valor);
  const meta = n.children[2];
  if (c.estado === 'ausente') meta.textContent = 'a fonte ainda não informa o saldo';
  else if (c.estado === 'vazio') meta.textContent = 'saldo veio vazio; não é R$ 0,00';
  else if (!c.data) negrito(meta, ['data não informada'], ' · ' + (c.fonte || 'fonte não informada'));
  else meta.textContent = 'atualizado em ' + ddmmaaaa(c.data) + (c.temHora ? ' ' + p2(c.data.getHours()) + ':' + p2(c.data.getMinutes()) : '') + ' · ' + (c.fonte || 'fonte não informada') + (c.antigo ? ' · há ' + plural(c.idade, 'dia', 'dias') : '');
  return n;
}

// Projeção do card: o dia 30 do mês corrente lido da análise; nunca calculado aqui.
export function cardProjecao(modelo, agora) {
  if (!modelo) return null;
  const chave = isoLocal(agora).slice(0, 7);
  const alvo = modelo.em30.find(x => x.data.startsWith(chave) && x.dia) || null;
  if (!alvo) return null;
  return { data: alvo.data, sem: alvo.dia.saldo.sem, com: alvo.dia.saldo.com, base: modelo.fonte.data_base, outraData: modelo.fonte.data_base !== isoLocal(agora) };
}

export function proximosDias(modelo, agora) {
  if (!modelo) return [];
  const ini = isoLocal(agora), fimD = new Date(agora); fimD.setDate(fimD.getDate() + 7); const fim = isoLocal(fimD);
  const out = [];
  for (const [data, d] of modelo.dias) if (data > ini && data <= fim) for (const e of d.ev) out.push({ data, desc: e.desc, valor: e.valor });
  return out;
}

export function hojeView(fontes, h, saldos, modelo, agora, mob, estado = {}, acoes = {}) {
  const proj = cardProjecao(modelo, agora), sinais = sinaisAtencao(h, saldos);
  const tituloProj = proj ? 'Em ' + isoDdmm(proj.data) + ' · análise de ' + isoDdmm(proj.base) : null;
  const d018 = parse(fontes.D018_Hoje), bloco = v => d018.querySelector('sc-if[value="{{ v.' + v + ' }}"]').firstElementChild;
  const alvo30 = isoLocal(agora).slice(0, 7) + '-30';
  // D-026 (D026_Hoje): a leitura da análise falhou. Sem "ver projeção" e sem "Próximos 7 dias", porque nada foi lido.
  const erroAnalise = m => { const v = clone(parse(fontes.D026_Hoje).querySelectorAll('section')[m ? 1 : 0]); v.querySelector('button').onclick = acoes.relerAnalise; return v; };
  const falhaReler = () => { const v = clone(parse(fontes.D008_Celular).children[1].children[4]); v.setAttribute('role', 'alert'); v.querySelector('button').onclick = acoes.reler; return v; };
  if (!mob) {
    const root = clone(parse(fontes.D008_Hoje));
    root.style.width = '100%'; root.style.minHeight = '100vh'; root.style.height = 'auto';
    const main = root.querySelector('main'); main.style.height = 'auto';
    const [cab, grade] = main.children;
    cab.firstElementChild.firstElementChild.textContent = SEMANA[agora.getDay()] + ', ' + agora.getDate() + ' de ' + MESES[agora.getMonth()] + ' de ' + agora.getFullYear();
    const reler = cab.querySelector('button'); reler.onclick = acoes.reler; if (estado.relendo) { reler.disabled = true; reler.setAttribute('aria-busy', 'true'); }
    const [esq, dir] = grade.children;
    const [secSaldos, secRecentes] = esq.children;
    const cards = secSaldos.children[1];
    const d012 = parse(fontes.D012_Hoje).querySelector('[aria-label="Saldos informados"]').children[1].children;
    const modelos = [...cards.children, d012[1], d012[2]];
    cards.replaceChildren(...saldos.contas.map(c => cartaoSaldo(modelos, c, false)));
    cards.style.gridTemplateColumns = 'repeat(' + Math.min(3, Math.max(1, saldos.contas.length)) + ', minmax(0, 1fr))';
    if (!saldos.contas.length) cards.remove();
    if (saldos.total) { const t = clone(bloco('total')); t.children[1].textContent = brl(saldos.total.valor); t.children[2].textContent = 'soma de ' + plural(saldos.total.n, 'conta', 'contas') + ' · dado mais antigo: ' + ddmm(saldos.total.maisAntiga); secSaldos.lastElementChild.replaceWith(t); }
    else if (saldos.nenhum) secSaldos.lastElementChild.replaceWith(clone(bloco('nenhum')));
    else negrito(secSaldos.lastElementChild, ...textoTotal(saldos, false));
    // Últimos lançamentos: modelos normal / com selo / previsão da prancha.
    const lista = secRecentes.children[1], [mNormal, mSelo, , mPrev] = [...lista.children];
    secRecentes.querySelector('a').href = './extrato.html';
    lista.replaceChildren();
    for (const r of h.ultimos.slice(0, 6)) {
      const selo = ESTADO.test(r.desc) && !r.projetado;
      const n = clone(r.projetado ? mPrev : selo ? mSelo : mNormal);
      n.children[0].textContent = r.data.slice(0, 5);
      const nome = n.children[1].children[0];
      if (selo) nome.firstChild.textContent = r.desc.replace(ESTADO, '') + ' '; else nome.textContent = r.desc.replace(ESTADO, '');
      n.children[1].children[1].textContent = r.projetado ? 'previsão' : [r.cartao, r.produto === 'cartao' ? 'cartão' : r.produto].filter(Boolean).join(' · ');
      const credito = r.tipo === 'Reembolso';
      n.children[2].textContent = (credito ? '+' : '−') + 'R$ ' + num(r.valor); if (credito) n.children[2].style.color = '#1C6B43';
      if (lista.children.length && !r.projetado && !n.style.borderTop) n.style.borderTop = mNormal.nextElementSibling?.style.borderTop || '1px solid #ECEAE4';
      lista.append(n);
    }
    if (!h.ultimos.length) secRecentes.remove();
    const [secProj, secAt, secProx] = dir.children;
    if (proj) {
      secProj.children[0].textContent = tituloProj; secProj.children[1].textContent = brl(proj.sem);
      if (proj.sem < 0) secProj.children[1].style.color = '#B3261E';
      secProj.children[2].textContent = 'sem acerto · com acerto previsto: ' + brl(proj.com);
      secProj.querySelector('a').href = './projecao.html';
      // D018: "Pode não incluir…" em linha própria, âmbar escuro, logo abaixo do título (inserida por último para não deslocar os índices).
      if (proj.outraData) secProj.insertBefore(clone(d018.querySelector('sc-if[value="{{ v.outra }}"] span')), secProj.children[1]);
    } else if (estado.erroAnalise) secProj.replaceWith(erroAnalise(false));
    else {
      const c = clone(bloco(modelo ? 'indisponivel' : 'semAnalise'));
      if (modelo) { c.children[1].textContent = 'A análise de ' + isoDdmm(modelo.fonte.data_base) + ' não traz o saldo de ' + isoDdmm(alvo30) + '. Não é saldo zero.'; c.querySelector('a').href = './projecao.html'; }
      secProj.replaceWith(c);
    }
    const [hAt, mCob, mBranco, , nota] = [...secAt.children];
    secAt.replaceChildren(hAt, ...sinais.map(s => { const n = clone(s.tipo === 'cobertura' ? mCob : mBranco); negrito(n, [s.titulo], s.texto); return n; }), nota);
    if (estado.relerFalhou) { const f = clone(bloco('reler')); f.querySelector('button').onclick = acoes.reler; main.insertBefore(f, grade); }
    const prox = proximosDias(modelo, agora);
    if (modelo) {
      const [hP, mP] = secProx.children; const notaP = secProx.lastElementChild; notaP.textContent = 'Eventos da análise diária, um por linha, na ordem da data.';
      const fim = new Date(agora); fim.setDate(fim.getDate() + 7);
      const vazio = () => { const v = clone(d018.querySelector('sc-if[value="{{ v.semEventos }}"] div')); v.textContent = 'Nenhum evento na análise até ' + ddmm(fim) + '.'; return v; };
      secProx.replaceChildren(hP, ...(prox.length ? prox.map(e => { const n = clone(mP); n.children[0].textContent = isoDdmm(e.data); n.children[1].textContent = e.desc; n.children[2].textContent = (e.valor < 0 ? '−' : '+') + num(e.valor); n.children[2].style.color = e.valor < 0 ? '' : '#1C6B43'; return n; }) : [vazio()]), notaP);
    } else secProx.remove();
    return root;
  }
  const fonte = parse(fontes.D008_Celular), tela = clone(fonte.children[0]);
  const [cab, corpo] = tela.children;
  cab.firstElementChild.firstElementChild.textContent = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][agora.getDay()] + ', ' + ddmmaaaa(agora);
  corpo.style.overflowY = 'auto'; corpo.style.minHeight = '0';
  const [at, blocoSaldos, blocoProj, reler, notaReler] = corpo.children;
  if (sinais.length) negrito(at, ['Atenção'], ' · ' + sinais.map(s => s.curto).join(' · ')); else at.remove();
  const linhas = [...blocoSaldos.children].slice(0, 3), totalSpan = blocoSaldos.lastElementChild;
  blocoSaldos.replaceChildren(...saldos.contas.map(c => cartaoSaldo(linhas, c, true)), totalSpan);
  totalSpan.textContent = textoTotal(saldos, true)[0];
  if (proj) { blocoProj.children[0].textContent = tituloProj + (proj.outraData ? '. Pode não incluir o que aconteceu depois.' : ''); blocoProj.children[1].textContent = brl(proj.sem); if (proj.sem < 0) blocoProj.children[1].style.color = '#B3261E'; blocoProj.children[2].textContent = 'sem acerto · com acerto previsto ' + brl(proj.com); }
  else if (estado.erroAnalise) blocoProj.replaceWith(erroAnalise(true));
  else { blocoProj.children[0].textContent = modelo ? 'Projeção indisponível' : 'Sem análise diária ainda'; blocoProj.children[0].style.fontWeight = '600'; blocoProj.children[1].remove(); blocoProj.lastElementChild.textContent = modelo ? 'A análise de ' + isoDdmm(modelo.fonte.data_base) + ' não traz o saldo de ' + isoDdmm(alvo30) + '. Não é saldo zero.' : 'A previsão do fim do mês aparece quando houver análise. Não é saldo zero.'; blocoProj.style.borderStyle = 'dashed'; }
  reler.onclick = acoes.reler; if (estado.relendo) { reler.disabled = true; reler.setAttribute('aria-busy', 'true'); }
  if (estado.relerFalhou) corpo.insertBefore(falhaReler(), reler);
  for (const n of corpo.children) n.style.flexShrink = '0';
  return tela;
}
