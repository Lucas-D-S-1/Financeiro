import './producao-estados.mjs';
// Controlador de preview D007/D008/D009/D010 — fixtures, sem autenticação real, sem POST.
import fontes from './fontes-complementos.mjs';

import { lerProjecao } from './projecao.mjs';
import { lerSaldosInformados } from './saldos.mjs';
import { lerOperacao } from './operacao.mjs';
import { operacaoView } from './operacao-view.mjs';
import { hojeView } from './hoje-view.mjs';
import { extratoView } from './extrato-view.mjs';
import { investimentosView } from './investimentos-view.mjs';
import { barraIndividual, menuConta, saiuView } from './navegacao-view.mjs';

const casoCobertura=await window.cadernoExtratoEnvelope();
const pessoaSessao=window.cadernoPerfil();
let modeloSessao=null;try{modeloSessao=lerProjecao(casoCobertura,pessoaSessao);}catch{modeloSessao=null;}
const hojeIso=(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})();
const PADRAO=(()=>{if(!modeloSessao)return{mes:null,dia:null,indice:0};const meses=modeloSessao.meses;let i=meses.findIndex(m=>m.days.some(d=>d.data===hojeIso));if(i<0)i=0;const dia=meses[i].days.some(d=>d.data===hojeIso)?hojeIso:meses[i].days[0].data;return{mes:meses[i].key,dia,indice:i};})();
const host = document.getElementById('complemento').attachShadow({ mode: 'open' });
const modulo = document.querySelector('script[data-modulo]').dataset.modulo;
const caso = {};
const ATIVO = { D007: 'Investimentos', D008: 'Hoje', D009: 'Extrato' }[modulo];
const DESTINOS = { Hoje: './hoje.html', Extrato: './extrato.html', Calendário: './calendario.html', Projeção: './projecao.html', Categorias: './caixa.html', Investimentos: './investimentos.html', Mais: './caixa.html?mais=1' };
const via = new URLSearchParams(location.search).get('via');

let menuAberto = false, saida = false, focarTitulo = true, aplicado = false;
let erroFixture = caso.erro || null;
const est = { relendo: false, relerFalhou: false };
const filtro = { periodo: 'mes', direcao: '', conta: '', busca: '' };
let folha = false, operacao = null, retornoOp = null, assinatura = '', focoApos = null;

const largura = () => innerWidth;
const desktop = () => modulo === 'D009' ? largura() >= 1024 : largura() >= 1200;
const ativoNoHost = () => host.activeElement;

function limpar() { menuAberto = false; folha = false; operacao = null; host.replaceChildren(); }
function abrirConta() { menuAberto = !menuAberto; render(); if (menuAberto) host.querySelector('[role=menu] button')?.focus(); else host.querySelector('[data-conta]')?.focus({ preventScroll: true }); }
function fecharConta() { menuAberto = false; render(); host.querySelector('[data-conta]')?.focus({ preventScroll: true }); }
function sair() { saida = true; menuAberto = false; window.cadernoSairPreview(); render(); host.querySelector('[role=heading]')?.focus({ preventScroll: true }); }
function voltarMais() { if (/caixa\.html\?mais=1/.test(document.referrer) && history.length > 1) history.back(); else location.href = './caixa.html?mais=1&origem=investimentos'; }

const acoesExtrato = {
  mes: d => { operacao = null; focoApos = d < 0 ? '[aria-label="Mês anterior"]' : '[aria-label="Próximo mês"]'; window.cadernoCaixaMes(d); },
  periodo: v => { operacao = null; filtro.periodo = v; focoApos = '[aria-label="Base do período"] [aria-pressed="true"]'; render(); },
  direcao: (v, grupo) => { operacao = null; filtro.direcao = v; focoApos = grupo ? 'input[name="' + grupo + '"]:checked' : '[aria-label="Direção"] [aria-pressed="true"]'; render(); },
  conta: (v, grupo) => { operacao = null; filtro.conta = v; focoApos = grupo ? 'input[name="' + grupo + '"]:checked' : 'select'; render(); },
  busca: v => { operacao = null; const i = ativoNoHost(); const pos = i?.selectionStart ?? v.length; filtro.busca = v; focoApos = { sel: 'input[type=search]', pos }; render(); },
  abrirFolha: () => { folha = true; focoApos = '[data-folha] h2'; render(); },
  fecharFolha: () => { folha = false; focoApos = '[data-filtros]'; render(); },
  limparDesktop: () => { filtro.direcao = ''; filtro.conta = ''; focoApos = '#resumo-extrato'; render(); },
  limpar: () => { filtro.direcao = ''; filtro.conta = ''; focoApos = folha ? 'input[name="filtro-direcao"]:checked' : '[data-filtros]'; render(); },
  tirar: k => { const chips = [...host.querySelectorAll('[data-chip]')].map(n => n.dataset.chip); const prox = chips[chips.indexOf(k) + 1]; filtro[k] = ''; focoApos = prox ? '[data-chip="' + prox + '"]' : '[data-filtros]'; render(); },
  operacao: id => { const env = window.cadernoOperacao(id); const op = env && lerOperacao(env, id, pessoaSessao); if (!op) return; retornoOp = { id, scroll: corpoRolavel()?.scrollTop || 0, janela: scrollY }; operacao = op; focoApos = largura() < 600 ? 'h2' : '#painel-operacao h2'; render(); },
  tentar: async () => { const ok = await window.cadernoReler(); if (ok) erroFixture = null; render(); }
};
// D017: selos da lista repetidos no painel ("em processamento" no título, "não conta como gasto" após a natureza).
function marcarPainel(aside, r) {
  if (!r) return;
  const h = aside.querySelector('h2'), m = String(r.desc).match(/\s+·\s+(em processamento)$/i);
  if (m) { h.textContent = r.desc.replace(m[0], ''); const c = document.createElement('span'); c.style.cssText = 'font-size: 12px; font-weight: 500; padding: 1px 7px; border-radius: 999px; border: 1px solid #B86E00; color: #7A4A00; white-space: nowrap; vertical-align: middle'; c.textContent = 'em processamento'; h.append(' ', c); }
  if (r.consideraGasto === false) { const nat = h.parentElement.querySelector('b')?.nextElementSibling; if (nat) { nat.style.display = 'flex'; nat.style.flexWrap = 'wrap'; nat.style.gap = '8px'; nat.style.alignItems = 'center'; const c = document.createElement('span'); c.style.cssText = 'font-size: 12px; padding: 1px 8px; border-radius: 999px; background: #ECEAE4; color: #16171A'; c.textContent = 'não conta como gasto'; nat.append(c); } }
}
function fecharOperacao() { operacao = null; render(); const c = corpoRolavel(); if (c && retornoOp) c.scrollTop = retornoOp.scroll; if (retornoOp) window.scrollTo(0, retornoOp.janela); host.querySelector('[data-operacao="' + CSS.escape(retornoOp?.id || '') + '"]')?.focus({ preventScroll: true }); }
const corpoRolavel = () => desktop() ? null : host.querySelector('[data-tela] > div:nth-child(2)');

// D020: releitura que falha com posições na tela mantém os números e avisa com os horários reais.
let releitura = null; const lidaEm = new Date();
async function relerInvestimentos() {
  const ok = await window.cadernoReler();
  releitura = ok ? null : { lida: lidaEm, falhou: new Date(), mensagem: caso.mensagemReler || 'falha na releitura' };
  render(); host.querySelector(releitura ? '[role=alert] button' : 'h1,[role=heading]')?.focus({ preventScroll: true });
}
async function reler() {
  if (est.relendo) return;
  est.relendo = true; est.relerFalhou = false; render();
  const ok = await window.cadernoReler();
  est.relendo = false; est.relerFalhou = !ok; if (ok && modulo === 'D007') erroFixture = null;
  render(); [...host.querySelectorAll('button')].find(b => b.textContent.trim() === 'Reler a base')?.focus({ preventScroll: true });
}

function ligarNavegacao(view, mob) {
  if (!mob) {
    view.querySelector('nav')?.replaceWith(barraIndividual(fontes, ATIVO, { conta: abrirConta }, pessoaSessao));
    return;
  }
  for (const n of view.querySelectorAll('nav > span, nav > a')) {
    const nome = n.textContent.trim(); const url = DESTINOS[nome];
    if (!url) continue;
    if (n.tagName === 'A') n.removeAttribute('href');
    n.setAttribute('role', 'link'); n.tabIndex = 0;
    if (nome === ATIVO && modulo !== 'D007') n.setAttribute('aria-current', 'page');
    n.onclick = () => { location.href = url; }; n.onkeydown = e => { if (e.key === 'Enter') location.href = url; };
  }
  const header = view.querySelector('header');
  const conta = header?.lastElementChild;
  if (conta) { conta.dataset.conta = 'topo'; if (conta.tagName === 'BUTTON') conta.onclick = abrirConta; }
  if (modulo === 'D007' && via === 'mais') { const v = header.querySelector('button'); v.className = 'mais-voltar'; v.style.removeProperty('outline'); v.style.removeProperty('outline-offset'); v.onclick = voltarMais; }
}

function titulo(view, mob) {
  if (!mob) return view.querySelector('h1');
  const h = view.querySelector('header')?.firstElementChild?.lastElementChild;
  if (h) { h.setAttribute('role', 'heading'); h.setAttribute('aria-level', '1'); }
  return h;
}

// Casos de fixture do D018: a mesma análise de Calendário/Projeção, recortada só para exibir o estado.
function analiseDoCaso(agora) {
  if (casoCobertura?.disponivel !== true) return casoCobertura;
  if (caso.caso === 'semanalise') return { perfil: 'Lucas', disponivel: false };
  if (caso.caso === 'erroanalise') return { perfil: 'Lucas', disponivel: false, erro: 'sem conexão' };
  const env = structuredClone(casoCobertura), p = env.dados.cash_projection;
  const chave = agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0');
  if (caso.caso === 'indisponivel') {
    const m = p.months.find(x => x.key === chave);
    if (m) { m.days = m.days.filter(d => d.d < 30); m.fim = { ...m.days.at(-1).saldo }; for (const k of ['sem', 'com']) { const d = m.days.reduce((a, b) => b.saldo[k] < a.saldo[k] ? b : a); m.minimo[k] = { v: d.saldo[k], data: d.data }; } }
  }
  if (caso.caso === 'semeventos') for (const m of p.months) for (const d of m.days) d.ev = [];
  return env;
}

function construir(mob) {
  if (modulo === 'D008') {
    const h = window.cadernoHoje(); if (!h) return null;
    const agora = new Date();
    const saldos = lerSaldosInformados(h.saldosBrutos, h.perfil, h.contasLedger, agora);
    const analise = analiseDoCaso(agora);
    let modelo = null; try { modelo = lerProjecao(analise, pessoaSessao); } catch { modelo = null; }
    window.__HOJE_PREVIEW__ = { saldos, sinais: null };
    // D-026: erro de leitura da análise é distinto de ausência e de formato inválido.
    const erroAnalise = !modelo && !!analise?.erro && !analise.formato;
    return hojeView(fontes, h, saldos, modelo, agora, mob, { ...est, erroAnalise }, { reler, relerAnalise: () => location.reload() });
  }
  if (modulo === 'D007') {
    const s = window.cadernoInvestimentos(); if (!s) return null;
    return investimentosView(fontes, { ...s, erro: erroFixture, releitura }, mob, { tentar: releitura ? relerInvestimentos : reler, viaMais: via === 'mais' });
  }
  const s = window.cadernoExtrato(filtro); if (!s) return null;
  window.__EXTRATO_PREVIEW__ = { snapshot: s, filtro: { ...filtro } };
  if (operacao) {
    const L = largura();
    // < 600: tela cheia D003_Celular_v3, como antes.
    if (L < 600) { const op = operacaoView(fontes, operacao, true, { fechar: fecharOperacao, contexto: [] }); op.firstElementChild.textContent = '‹ Extrato'; op.dataset.tela = 'operacao'; return op; }
    const op = operacaoView(fontes, operacao, false, { fechar: fecharOperacao, contexto: [] });
    const aside = op.querySelector('aside'); aside.id = 'painel-operacao';
    marcarPainel(aside, s.txs.find(r => r.id === operacao.id));
    const lista = extratoView(fontes, s, filtro, L, { aberta: operacao.id }, acoesExtrato);
    if (L >= 1280) {
      // D017 ≥1280: painel de 420 px ao lado da lista, sem escurecer nada.
      Object.assign(aside.style, { flex: '0 0 420px', position: 'sticky', top: '0', height: '100vh', overflowY: 'auto', boxSizing: 'border-box', alignSelf: 'flex-start' });
      lista.append(aside);
    } else {
      // D017 1024–1279 (e D019 600–1023): painel sobreposto, modal, com fundo rgba(22,23,26,0.35).
      const camada = document.createElement('div'); camada.style.cssText = 'position: fixed; inset: 0; z-index: 50';
      const fundo = document.createElement('div'); fundo.style.cssText = 'position: absolute; inset: 0; background: rgba(22,23,26,0.35)'; fundo.onclick = fecharOperacao;
      Object.assign(aside.style, { position: 'absolute', top: '0', right: '0', bottom: '0', width: '420px', maxWidth: '100%', overflowY: 'auto', boxSizing: 'border-box' });
      aside.setAttribute('role', 'dialog'); aside.setAttribute('aria-modal', 'true');
      aside.setAttribute('aria-label', 'Operação ' + operacao.nome);
      // Tab circula só dentro do painel modal (✕ → conteúdo → ✕).
      aside.addEventListener('keydown', e => { if (e.key !== 'Tab') return; const T = [...aside.querySelectorAll('button:not([disabled]),a[href],[tabindex="0"]')]; if (!T.length) return; e.preventDefault(); const i = T.indexOf(aside.getRootNode().activeElement); (e.shiftKey ? (i <= 0 ? T.at(-1) : T[i - 1]) : (i < 0 ? T[0] : T[(i + 1) % T.length])).focus(); });
      for (const n of lista.children) n.inert = true;
      camada.append(fundo, aside); lista.append(camada);
    }
    aside.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fecharOperacao(); } });
    return lista;
  }
  const v = extratoView(fontes, s, filtro, largura(), { folha, erro: erroFixture }, acoesExtrato);
  return v;
}

function render() {
  if (saida) { const style = document.createElement('style'); style.textContent = 'button{font:inherit;color:inherit}'; host.replaceChildren(style, saiuView(fontes)); return; }
  if (!window.__CASO_CAIXA_READY__ || !window.cadernoCaixaEscopoAtivo?.()) { if (aplicado) limpar(); return; }
  aplicado = true;
  const mob = !desktop();
  const rolagem = corpoRolavel()?.scrollTop || 0;
  // Re-render troca o DOM: guarda o equivalente do elemento focado para devolvê-lo depois.
  const a0 = host.activeElement, antes = a0 ? { tag: a0.tagName, label: a0.getAttribute('aria-label'), texto: a0.textContent.trim(), titulo: a0.matches('h1,[role=heading]'), pos: a0.selectionStart } : null;
  const view = construir(mob); if (!view) { host.replaceChildren(); return; }
  view.style.fontFamily = 'Geist,system-ui,sans-serif'; view.style.color = '#16171A'; view.style.boxSizing = 'border-box';
  if (mob) { view.style.width = '100%'; view.style.height = '100vh'; view.style.display = 'flex'; view.style.flexDirection = 'column'; view.dataset.tela = view.dataset.tela || 'modulo'; }
  if (!(operacao && largura() < 600)) ligarNavegacao(view, mob);
  if (menuAberto) {
    const menu = menuConta(fontes, mob, { fechar: fecharConta, sair }, pessoaSessao);
    if (mob) { for (const n of view.children) n.inert = true; view.append(menu); } else view.querySelector('nav')?.append(menu);
    for (const b of view.querySelectorAll('[data-conta]')) b.setAttribute('aria-expanded', 'true');
  }
  if (folha && mob) for (const n of view.children) if (!n.querySelector('[data-folha]') && !n.matches('[data-folha]')) n.inert = true;
  const style = document.createElement('style');
  style.textContent = 'button,select,input,nav a{font:inherit;color:inherit}button:focus-visible,[role=button]:focus-visible,[role=link]:focus-visible,select:focus-visible,input:focus-visible,label:focus-within{outline:2px solid #16171A;outline-offset:2px}.mais-voltar:focus-visible{outline:3px solid #2451B8;outline-offset:-2px}[data-operacao]{cursor:pointer;width:100%;text-align:left;font:inherit}h1[tabindex="-1"]:focus,h2[tabindex="-1"]:focus,[role=heading][tabindex="-1"]:focus{outline:none}';
  window.cadernoIdentidade(view, pessoaSessao, mob);
  host.replaceChildren(style, view);
  // Rolagem do D010: resultado mudou → topo com o resumo visível; senão fica onde estava.
  if (modulo === 'D009' && mob && !operacao) {
    const nova = JSON.stringify(window.__EXTRATO_PREVIEW__.snapshot.txs.map(r => r.id)) + filtro.periodo;
    const c = corpoRolavel(); if (c) c.scrollTop = nova === assinatura ? rolagem : 0;
    assinatura = nova;
  }
  if (focarTitulo && !menuAberto) { const t = titulo(view, mob); if (t) { t.tabIndex = -1; t.focus({ preventScroll: true }); } focarTitulo = false; }
  if (!focoApos && antes && !menuAberto) {
    const t = antes.titulo ? titulo(view, mob) : [...host.querySelectorAll(antes.tag)].find(n => n.getAttribute('aria-label') === antes.label && n.textContent.trim() === antes.texto);
    if (t) { if (antes.titulo) t.tabIndex = -1; t.focus({ preventScroll: true }); }
  }
  if (focoApos) {
    const alvo = typeof focoApos === 'string' ? host.querySelector(focoApos) : host.querySelector(focoApos.sel);
    if (alvo) { alvo.focus({ preventScroll: true }); if (focoApos.pos !== undefined && alvo.setSelectionRange) alvo.setSelectionRange(focoApos.pos, focoApos.pos); }
    focoApos = null;
  }
  host.onkeydown = e => { if (e.key === 'Escape' && operacao) { e.preventDefault(); fecharOperacao(); } };
}

window.addEventListener('caderno-categorias', render);
window.addEventListener('caderno-invalidar-sessao', () => { limpar(); });
window.addEventListener('resize', render);
setTimeout(render, 0);
if (modulo === 'D007' && caso.caso === 'relerfalha') window.addEventListener('caderno-categorias', function primeira() { window.removeEventListener('caderno-categorias', primeira); setTimeout(relerInvestimentos, 50); });
window.__MODULO_PREVIEW__ = { render, filtro, modulo };
