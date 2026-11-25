import { GRUPOS, chaveLocal, deslocarMes, lerMes, mesExtenso, mesValido, moeda } from './mensal.mjs';
import { lerProjecao } from './projecao.mjs';

const pais = window.parent;
const app = document.querySelector('#mensal');
const consulta = new URLSearchParams(location.search);
const mes = mesValido(consulta.get('mes')) ? consulta.get('mes') : chaveLocal();
const urlMensal = (chave, filtro = '') => './mensal.html?mes=' + chave + (filtro ? '&filtro=' + filtro : '');
const estado = { filtro: consulta.get('filtro') === 'cartao' ? 'cartao' : 'tudo', busca: '', todos: new Set() };
const PAGINA = 5;
const escapar = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const normalizar = texto => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const curto = chave => mesExtenso(chave, true).split(' ')[0];
const capitalize = nome => nome[0].toUpperCase() + nome.slice(1);
const icone = d => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="${d}"/></svg>`;
const esq = icone('m15 18-6-6 6-6');
const dir = icone('m9 18 6-6-6-6');
const fechar = icone('M18 6 6 18M6 6l12 12');
const baixo = icone('m6 9 6 6 6-6');
const lupa = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
const links = [
  ['Hoje', './hoje.html'], ['Extrato', './extrato.html'], ['Calendário', './calendario.html'],
  ['Projeção', './projecao.html'], ['Categorias', './caixa.html?mes=' + mes], ['Investimentos', './investimentos.html'],
];
const soma = (linhas, campo) => linhas.reduce((s, i) => s + i[campo], 0);
const money = (n, classe = '') => `<span class="money ${classe}">${moeda(n)}</span>`;
const tags = (item, outro) => [
  item.novo ? '<span class="tag novo">novo</span>' : '',
  item.parcelas > 1 ? `<span class="tag parc">${item.atual}/${item.parcelas}</span>` : '',
  item.cartaoOutro ? `<span class="tag julia">cartão ${escapar(outro)}</span>` : '',
].join('');
const segs = ({ atual, parcelas }) => '<div class="segs" aria-hidden="true">' +
  Array.from({ length: parcelas }, (_, i) => `<i class="${i + 1 === atual ? 'agora' : i + 1 < atual ? 'on' : ''}"></i>`).join('') + '</div>';

let modelo = null, revisao = 0;
function atualizar() {
  const rodada = ++revisao;
  if (!pais.cadernoCaixaEscopoAtivo()) { modelo = null; app.replaceChildren(); return; }
  let dados;
  try {
    dados = pais.cadernoMensal(mes);
    if (!dados) throw new Error('sem dados no recorte');
    modelo = lerMes(dados, mes);
    montar();
  } catch {
    modelo = null;
    app.innerHTML = '<main class="main"><h1>Visão mensal</h1><p role="alert">Não foi possível carregar os gastos deste mês.</p><button type="button" data-repetir>Tentar de novo</button></main>';
    return;
  }
  pais.cadernoExtratoEnvelope().then(envelope => {
    if (revisao !== rodada || !pais.cadernoCaixaEscopoAtivo()) return;
    const projecao = lerProjecao(envelope, dados.perfil);
    const dia = projecao?.meses.find(m => m.key === mes)?.days.at(-1);
    if (!dia) { caixa(envelope.erro ? 'erro' : 'vazio'); return; }
    const [ano, mm] = mes.split('-').map(Number);
    if (dia.d !== new Date(Date.UTC(ano, mm, 0)).getUTCDate()) { caixa('vazio'); return; }
    caixa('fim', dia);
  }).catch(() => { if (revisao === rodada && pais.cadernoCaixaEscopoAtivo()) caixa('erro'); });
}

function caixa(situacao, dia) {
  const destino = app.querySelector('#fechamento');
  if (situacao === 'fim') {
    destino.innerHTML = `<strong>Caixa previsto em ${dia.d}/${mes.slice(5)}</strong>
      <span>Com acerto ${money(Math.round(dia.saldo.com * 100), 'caixa-com')}</span>
      <span>Sem acerto ${money(Math.round(dia.saldo.sem * 100), 'caixa-sem')}</span>`;
  } else {
    destino.textContent = situacao === 'vazio' ? 'Sem projeção para o fim do mês.' : 'Não foi possível carregar a projeção.';
  }
}

function montar() {
  const { perfil, previsoes, parcial, acerto, bruto, sem, com, itens } = modelo;
  app.dataset.perfil = perfil;
  const identidade = `<span class="pt" aria-hidden="true"></span><span><b>${escapar(perfil)}</b></span>`;
  const lateral = links.map(([nome, url]) => `<a href="${url}"${nome === 'Categorias' ? ' aria-current="location"' : ''}>${nome}</a>`).join('');
  const mobile = [...links.slice(0, 4), ['Mais', './caixa.html?mais=1']].map(([nome, url]) =>
    `<a href="${url}"${nome === 'Mais' ? ' aria-current="location"' : ''}><i></i>${nome}</a>`).join('');
  const grupos = GRUPOS.map(g => ({ ...g, total: soma(itens.filter(i => i.grupo === g.id), 'valor') }));
  const pct = total => (bruto ? total / bruto : 0).toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
  const barra = grupos.filter(g => g.total > 0).map(g => `<span class="${g.id}" style="flex:${g.total}"></span>`).join('');
  const legenda = grupos.map(g => `<li><span class="ponto ${g.id}"></span><span class="nome">${g.nome}</span>
    <span class="val">${moeda(g.total)}<small>${pct(g.total)}</small></span></li>`).join('');
  const seta = (delta, svg) => {
    const chave = deslocarMes(mes, delta);
    const rotulo = delta < 0 ? 'Mês anterior' : 'Próximo mês';
    return mesValido(chave) ? `<a class="seta" href="${urlMensal(chave)}" aria-label="${rotulo}">${svg}</a>`
      : '';
  };
  const conta = acerto
    ? `<span>Sem acerto <b id="mensal-sem">${moeda(sem)}</b></span>
       <span>${acerto.liquido >= 0 ? '−' : '+'} <b>${moeda(Math.abs(acerto.liquido))}</b> de acerto com ${escapar(modelo.outro)}</span>`
    : '<span>Total líquido do Caderno</span>';
  app.innerHTML = `<div class="frame">
    <aside class="side" aria-label="Navegação">
      <div class="logo">Agente de <mark>Gastos</mark></div>
      <button type="button" class="quem" aria-haspopup="dialog" data-conta>${identidade}${baixo}</button>
      <p class="sec">Seu</p><nav class="menu">${lateral}</nav>
    </aside>
    <main class="main"><div class="conteudo">
      <div class="topo">
        <div><div class="mes">${seta(-1, esq)}<span>${capitalize(mesExtenso(mes))}</span>${seta(1, dir)}</div><h1>Visão mensal</h1></div>
        <button type="button" class="quem-m" aria-haspopup="dialog" data-conta>${identidade}</button>
        <nav class="tabs" aria-label="Categorias e visão mensal"><a href="./caixa.html?mes=${mes}">Categorias</a><a href="${urlMensal(mes)}" aria-current="page">Visão mensal</a></nav>
      </div>
      <section class="card resumo" aria-labelledby="t-resumo">
        <div class="resumo-top">
          <div><p class="rotulo" id="t-resumo">Gasto de ${mesExtenso(mes).split(' de ')[0]}${acerto ? ' com acerto' : ''}</p>
            <p class="grande" id="mensal-com">${moeda(com)}</p><p class="conta">${conta}</p></div>
          ${previsoes ? '<span class="previsao">Inclui previsões</span>' : parcial ? '<span class="previsao">Mês parcial</span>' : ''}
        </div>
        ${barra ? `<div class="barra" aria-hidden="true">${barra}</div>` : ''}
        <ul class="legenda" aria-label="Gasto por grupo, antes dos créditos">${legenda}</ul>
        <div class="caixa" id="fechamento" role="status">Carregando projeção…</div>
      </section>
      <div class="cols">
        <div class="lista">
          <div class="filtros">
            <div class="chips" role="group" aria-label="Filtrar compras"></div>
            <label class="busca">${lupa}<input type="search" placeholder="Buscar compra" aria-label="Buscar compra"></label>
          </div>
          <div class="grupos" id="grupos"></div>
        </div>
        <aside class="rail">${rail()}</aside>
      </div>
    </div></main>
  </div><nav class="baixo" aria-label="Navegação">${mobile}</nav>
  <dialog class="overlay" aria-labelledby="d-t"></dialog>`;
  app.querySelector('input').value = estado.busca;
  atualizarLista();
}

function atualizarLista() {
  const { itens, outro, acerto } = modelo;
  const pesquisa = normalizar(estado.busca.trim());
  const filtros = [
    ['tudo', 'Tudo', () => true],
    ['novos', 'Novos', i => i.novo],
    ['parcelas', 'Parcelas', i => i.parcelas > 1],
  ];
  if (acerto) filtros.push(['cartao', 'Cartão ' + outro, i => i.cartaoOutro]);
  const filtrar = filtros.find(([id]) => id === estado.filtro) || filtros[0];
  app.querySelector('.chips').innerHTML = filtros.map(([id, rotulo, condicao]) =>
    `<button type="button" data-filtro="${id}" aria-controls="grupos" aria-pressed="${filtrar[0] === id}">${escapar(rotulo)}${id !== 'tudo' ? ` <span>${itens.filter(condicao).length}</span>` : ''}</button>`).join('');
  const visiveis = itens.filter(i => filtrar[2](i) && normalizar([i.nome, i.categoria, i.forma].join(' ')).includes(pesquisa));
  app.querySelector('#grupos').innerHTML = GRUPOS.map(g => {
    const linhas = visiveis.filter(i => i.grupo === g.id);
    if (!linhas.length) return '';
    const expandido = estado.todos.has(g.id);
    return `<section class="grupo" aria-labelledby="g-${g.id}"><header class="g-head">
      <span class="ponto ${g.id}"></span><h2 id="g-${g.id}">${g.nome}</h2><span class="n">${linhas.length}</span>${money(soma(linhas, 'valor'))}
      </header><ul class="rows card" id="itens-${g.id}">${(expandido ? linhas : linhas.slice(0, PAGINA)).map(linha).join('')}</ul>
      ${linhas.length > PAGINA ? `<button type="button" class="ver" data-grupo="${g.id}" aria-controls="itens-${g.id}" aria-expanded="${expandido}">${expandido ? 'Mostrar menos' : 'Ver todos os ' + linhas.length}</button>` : ''}
    </section>`;
  }).join('') || '<p class="card vazio" role="status">Nenhuma compra encontrada.</p>';
}

function linha(item) {
  const [dia, mm, ano] = item.data?.split('/') || [];
  const temData = /^\d{2}$/.test(dia) && /^\d{2}$/.test(mm) && /^\d{4}$/.test(ano);
  const diaTxt = temData ? dia : '—';
  const mesTxt = curto(temData && mesValido(ano + '-' + mm) ? ano + '-' + mm : mes);
  return `<li><button type="button" class="row" data-item="${escapar(item.id)}" aria-haspopup="dialog">
    <span class="dia" aria-hidden="true">${diaTxt}<small>${mesTxt}</small></span>
    <span class="copy"><b>${escapar(item.nome)}</b><small>${[item.categoria, item.forma, item.previsto && item.forma !== 'Previsão' ? 'previsão' : ''].filter(Boolean).map(escapar).join(' · ')}</small></span>
    <span class="tags">${tags(item, modelo.outro)}</span>${money(item.valor)}</button></li>`;
}

function rail() {
  const { parcelas, acerto, outro, proximo, itens } = modelo;
  const cartao = itens.filter(i => i.cartaoOutro).length;
  const falta = soma(parcelas, 'falta');
  const restante = parcelas.some(i => i.faltaEstimada) ? 'cerca de ' : '';
  const lista = parcelas.slice(0, PAGINA).map(i => `<li>
    <div class="l1"><span>${escapar(i.nome)}</span>${money(i.valor)}</div>${segs(i)}
    <div class="l2"><span>${i.atual} de ${i.parcelas}</span><span>faltam ${i.faltaEstimada ? '≈ ' : ''}${moeda(i.falta)}</span></div>
    </li>`).join('');
  const nome = escapar(outro);
  return `<section class="card rail-card" aria-labelledby="t-parc">
    <div class="rc-head"><h2 id="t-parc">Parcelas rodando</h2>${money(soma(parcelas, 'valor'))}</div>
    <p class="sub">${parcelas.length ? `${parcelas.length} ${parcelas.length === 1 ? 'compra' : 'compras'} · depois deste mês faltam ${restante}${moeda(falta)}` : 'Nenhuma parcela com saldo futuro.'}</p>
    ${lista ? `<ul class="parc-l">${lista}</ul>` : ''}
    ${parcelas.length > PAGINA ? '<button type="button" class="link" data-filtrar="parcelas">Ver compras parceladas</button>' : ''}
  </section>
  ${acerto ? `<section class="card rail-card" aria-labelledby="t-acerto">
    <div class="rc-head"><h2 id="t-acerto">Acerto com ${nome}</h2>${money(acerto.liquido, 'acerto-liquido')}</div>
    <p class="sub">${acerto.liquido > 0 ? `${nome} te deve neste mês` : acerto.liquido < 0 ? `Você deve ${outro === 'Julia' ? 'à' : 'ao'} ${nome} neste mês` : 'Saldo zerado'}${acerto.previsto ? ' · previsto' : ''}</p>
    <dl class="acerto" aria-label="Saldo líquido do acerto"><div><dt>${nome} te deve</dt><dd id="acerto-receber">${moeda(acerto.receber)}</dd></div>
    <div><dt>Você deve ${outro === 'Julia' ? 'à' : 'ao'} ${nome}</dt><dd id="acerto-pagar">${moeda(acerto.pagar)}</dd></div></dl>
    ${cartao ? `<button type="button" class="link" data-filtrar="cartao">Ver compras no cartão de ${nome}</button>` : ''}
    ${proximo ? `<a class="link" href="${urlMensal(proximo.mes, 'cartao')}">${proximo.n} ${proximo.n === 1 ? 'compra' : 'compras'} no próximo acerto · ${moeda(proximo.total)}</a>` : ''}
  </section>` : ''}`;
}

function detalhe(item) {
  const agenda = item.parcelas > 1 ? `<div class="bloco">
    <h3>Parcelas <span>Faltam ${item.faltaEstimada ? '≈ ' : ''}${moeda(item.falta)}</span></h3>
    ${segs(item)}<ol class="agenda">${item.agenda.map((r, i) => `<li class="${i === 0 ? 'agora' : ''}">
    <span class="m">${escapar(curto(r.mes) + '/' + r.mes.slice(2, 4))}</span><span>${r.numero} de ${item.parcelas}${i === 0 ? ' · esta' : ''}</span>
    ${money(r.valor)}${r.estimado ? '<small class="agenda-prev">estimativa</small>' : ''}</li>`).join('')}</ol></div>` : '';
  const rateio = item.rateio;
  const percentual = rateio?.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const rotuloRateio = rateio && `${percentual}% ${escapar(modelo.perfil)}`;
  const parteOutro = rateio ? (rateio.estimado ? '≈ ' : '') + moeda(rateio.outro) : '';
  const totalParte = item.parcelas > 1 && item.totalParte !== null && item.totalParte !== undefined
    ? ' · sua parte total ' + moeda(item.totalParte) : '';
  const ficha = [
    ['Data da compra', item.data || 'Sem data registrada'], ['Mês de caixa', mesExtenso(mes)],
    ['Pagamento', item.forma], ['Categoria', item.categoria],
  ].filter(([, valor]) => valor).map(([nome, valor]) => `<div><dt>${nome}</dt><dd>${escapar(valor)}</dd></div>`).join('');
  return `<section class="painel">
    <div class="d-head"><p class="rotulo">${GRUPOS.find(g => g.id === item.grupo).nome}</p><button type="button" class="fechar" aria-label="Fechar" autofocus>${fechar}</button></div>
    <div class="d-nome"><h2 id="d-t">${escapar(item.nome)}</h2><div class="tags">${tags(item, modelo.outro)}</div></div>
    <div class="d-valor"><p class="grande">${moeda(item.valor)}</p><p class="sub">${item.parcelas > 1 ? 'Parcela' : 'Valor'}${item.cartaoOutro ? ' no acerto' : ''} de ${escapar(mesExtenso(mes))}${item.previsto ? ' · previsto' : ''}${totalParte}</p></div>
    ${agenda}
    ${rateio ? `<div class="bloco"><h3>Rateio <span>${rotuloRateio}</span></h3>
    <div class="split" aria-hidden="true"><i class="lu" style="flex:${rateio.percentual}"></i>${rateio.percentual < 100 ? `<i class="ju" style="flex:${100 - rateio.percentual}"></i>` : ''}</div>
    <div class="split-leg"><span>${escapar(modelo.perfil)}<b>${moeda(rateio.meu)}</b></span><span>${escapar(modelo.outro)}<b>${parteOutro}</b></span></div>
    ${item.cartaoOutro ? `<p class="nota j">Sua parte de ${moeda(item.valor)} entra no acerto de ${escapar(mesExtenso(mes))}.</p>` : ''}
    </div>` : ''}
    <dl class="ficha">${ficha}</dl>
  </section>`;
}

function dialogo(conteudo) {
  const dialog = app.querySelector('dialog');
  dialog.innerHTML = conteudo;
  dialog.showModal();
}

app.addEventListener('click', e => {
  const dialog = app.querySelector('dialog');
  if (dialog && e.target === dialog) { dialog.close(); return; }
  const alvo = e.target.closest('button');
  if (!alvo) return;
  if (alvo.matches('[data-repetir]')) { atualizar(); return; }
  if (alvo.matches('.fechar')) { dialog.close(); return; }
  if (alvo.matches('[data-sair]')) { pais.cadernoSairPreview(); return; }
  if (alvo.matches('[data-conta]')) {
    dialogo(`<section class="painel"><div class="d-head"><h2 id="d-t">${escapar(modelo.perfil)}</h2>
      <button type="button" class="fechar" aria-label="Fechar" autofocus>${fechar}</button></div>
      <p class="sub">${escapar(pais.cadernoEmail())}</p><button type="button" class="ver" data-sair>Sair</button></section>`);
    return;
  }
  if (alvo.dataset.item) { dialogo(detalhe(modelo.itens.find(i => i.id === alvo.dataset.item))); return; }
  if (alvo.dataset.grupo) {
    const id = alvo.dataset.grupo;
    if (estado.todos.has(id)) estado.todos.delete(id); else estado.todos.add(id);
    atualizarLista();
    const foco = estado.todos.has(id) ? app.querySelectorAll('#itens-' + id + ' button')[PAGINA] : app.querySelector('[data-grupo="' + id + '"]');
    foco?.focus();
  }
  const filtro = alvo.dataset.filtro || alvo.dataset.filtrar;
  if (filtro) {
    estado.filtro = alvo.dataset.filtro && filtro === estado.filtro ? 'tudo' : filtro;
    estado.todos.clear();
    if (alvo.dataset.filtrar) {
      estado.busca = '';
      app.querySelector('input').value = '';
    }
    atualizarLista();
    app.querySelector('[data-filtro="' + estado.filtro + '"]').focus();
  }
});
app.addEventListener('input', e => {
  if (e.target.type !== 'search') return;
  estado.busca = e.target.value;
  estado.todos.clear();
  atualizarLista();
});

if (pais === window) {
  location.replace('./#' + urlMensal(mes, estado.filtro === 'cartao' ? 'cartao' : '').slice(2));
} else if (typeof pais.cadernoCaixaEscopoAtivo === 'function') {
  window.addEventListener('caderno-categorias', atualizar);
  window.addEventListener('caderno-invalidar-sessao', () => {
    revisao++;
    modelo = null;
    app.replaceChildren();
  });
  atualizar();
}
