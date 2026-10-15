// Shell de PRODUÇÃO: estados de entrada e a moldura dos módulos.
//
// Roda no documento do motor (onde vive o ID token, só em memória). Os módulos
// abrem num iframe da mesma origem e leem o motor pela ponte; navegar entre
// eles não pede login de novo e não leva credencial para lugar nenhum.
//
// Desenho: L-005 `Main` (computador) e `D023_Celular`/`D024_D025_Celular`
// (celular) — marca acima, cartão centralizado, botão OFICIAL do Google no
// lugar marcado (D-023), aviso de falha do login (D-024), carregando e erro em
// duas telas (D-025). O estado 0 (bloqueio seguro) é o cartão do
// D001_Estados_v2, sem mudança.
import fontes from './fontes-complementos.mjs';

const parse = s => new DOMParser().parseFromString(s, 'text/html').querySelector('x-dc > div');
const clone = n => document.importNode(n, true);
const MODULOS = ['hoje', 'extrato', 'caixa', 'calendario', 'projecao', 'investimentos'];
const IDENTIDADE = { Lucas: 'background: #C8F04A; box-shadow: 0 0 0 1px #8FB31C', Julia: 'background: #2FB79B' };

const hostEntrada = document.createElement('div');
hostEntrada.id = 'caderno-entrada';
const sombra = hostEntrada.attachShadow({ mode: 'open' });
// O botão do Google continua no DOM do motor (getElementById); um slot o
// mostra dentro do cartão sem tirá-lo de lá.
const botaoGoogle = document.getElementById('google-signin');
botaoGoogle.slot = 'google';
hostEntrada.append(botaoGoogle);
document.body.append(hostEntrada);

let tela = null, atual = { estado: 'entrada' }, relogio = null;

function rotaInicial() {
  const r = location.hash.slice(1).split('?')[0].replace(/\.html$/, '');
  return MODULOS.includes(r) ? location.hash.slice(1).replace(/^([a-z]+)(\.html)?/, '$1.html') : 'hoje.html';
}
function abrirTela() {
  if (tela) return;
  tela = document.createElement('iframe');
  tela.id = 'tela';
  tela.title = 'Caderno de caixa';
  tela.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:#F4F3EF';
  tela.src = './' + rotaInicial();
  tela.addEventListener('load', () => {
    try {
      const w = tela?.contentWindow; if (!w || w.location.origin !== location.origin) return;
      const caminho = w.location.pathname.split('/').pop() + w.location.search;
      if (/^[a-z]+\.html/.test(caminho)) history.replaceState(null, '', '#' + caminho);
      w.focus();
    } catch { /* outra origem: nada a fazer */ }
  });
  document.body.append(tela);
}
function fecharTela() {
  if (!tela) return;
  tela.remove(); tela = null;
}
// O motor avisa os módulos por eventos na própria janela; o iframe ouve na dele.
for (const nome of ['caderno-categorias', 'caderno-invalidar-sessao']) {
  window.addEventListener(nome, () => {
    if (nome === 'caderno-invalidar-sessao') { fecharTela(); return; }
    try { const w = tela?.contentWindow; if (w && w.location.origin === location.origin) w.dispatchEvent(new w.CustomEvent(nome)); } catch { }
  });
}

// ── Cartões da prancha L-005 ───────────────────────────────────────────────
const SC = n => [...n.querySelectorAll('sc-if')];
const desembrulhar = n => n.replaceWith(...n.childNodes);
function palco(mob) {
  const original = parse(fontes.L005_Main);
  const p = clone(original.children[1]);
  // Cor e fonte vêm da raiz da prancha; o body do motor tem outra cor de texto.
  Object.assign(p.style, { minHeight: '100vh', width: '100%', flex: 'none', color: original.style.color, fontFamily: original.style.fontFamily });
  const caixa = p.children[1];
  if (mob) {
    // D023_Celular: largura total, margem de 16 px e 28 px no topo.
    Object.assign(p.style, { padding: '28px 16px', gap: '18px', alignItems: 'stretch' });
    p.firstElementChild.style.textAlign = 'center';
    caixa.style.width = '100%';
  }
  return { p, caixa, original };
}
function cartao(original, chave) {
  const bloco = SC(original).find(n => n.getAttribute('value') === '{{ v.' + chave + ' }}');
  return clone(bloco.querySelector('section'));
}
function comGoogle(card) {
  const lugar = card.querySelector('span[role=img][aria-label^="Botão oficial do Google"]');
  const slot = document.createElement('slot'); slot.name = 'google';
  lugar.replaceWith(slot);
}

function montar() {
  const { estado } = atual, mob = innerWidth < 600;
  const { p, caixa, original } = palco(mob);
  let card, foco;
  if (estado === 'bloqueio') {
    const d001 = parse(fontes.D001_Estados_v2);
    const sec = [...d001.querySelectorAll('section')].find(n => n.firstElementChild.textContent.startsWith('0 ·'));
    card = clone(sec.children[1]);
    foco = card.querySelector('span > span'); foco.setAttribute('role', 'heading'); foco.setAttribute('aria-level', '1');
    card.querySelector('button').onclick = () => window.cadernoSairPreview();
  } else if (estado === 'naoCadastrada') {
    card = cartao(original, 'c2'); comGoogle(card);
    card.querySelector('h1').textContent = (atual.email || 'Esta conta') + ' não está autorizada neste painel';
  } else if (estado === 'expirou') {
    card = cartao(original, 'c3'); comGoogle(card);
    card.querySelector('p').textContent = atual.email ? 'A tela foi limpa. Entre de novo com ' + atual.email + ' para continuar.' : 'A tela foi limpa. Entre de novo para continuar.';
  } else if (estado === 'carregando') {
    card = cartao(original, 'c4');
    const status = card.querySelector('[role=status]'), nome = SC(card)[0];
    if (atual.nome && IDENTIDADE[atual.nome]) {
      const marca = nome.querySelector('span'); marca.style.cssText = marca.style.cssText.replace(/background:[^;]+;?\s*box-shadow:[^;]+;?/, '') + ';' + IDENTIDADE[atual.nome];
      nome.lastChild.textContent = atual.nome + ' · '; desembrulhar(nome);
    } else nome.remove();
    // D012: depois de 8 s, "ainda carregando", sem botão.
    clearTimeout(relogio);
    relogio = setTimeout(() => { if (atual.estado === 'carregando') status.lastChild.textContent = 'ainda carregando seu painel…'; }, 8000);
  } else if (estado === 'erro') {
    card = cartao(original, 'c4erro');
    card.querySelector('p').textContent = 'A base respondeu: “' + (atual.mensagem || 'sem resposta') + '”. Nada foi alterado na base.';
    const [tentar, sair] = card.querySelectorAll('button');
    tentar.onclick = () => window.cadernoTentarDeNovo();
    sair.onclick = () => window.cadernoSairPreview();
  } else if (estado === 'saiu') {
    card = cartao(original, 'c8'); comGoogle(card);
  } else {
    card = cartao(original, 'c1');
    const [aviso, gis, botao] = SC(card);
    if (atual.codigo === 'gis_indisponivel') {
      aviso.remove(); botao.remove(); desembrulhar(gis);
      card.querySelector('button').onclick = () => window.cadernoEntrarDeNovo();
    } else {
      gis.remove(); desembrulhar(botao); comGoogle(card);
      const explicacao = atual.aviso ? [...document.getElementById('login-erro').childNodes].slice(1) : [];
      if (explicacao.length) {
        // D-024: "Não deu para entrar." + a explicação que o motor já escreve.
        const div = aviso.querySelector('div');
        div.lastChild.replaceWith(' ', ...explicacao.map(n => clone(n)));
        for (const c of div.querySelectorAll('code')) c.style.cssText = "font-family: 'Geist Mono', monospace; font-size: 13px";
        desembrulhar(aviso);
      } else aviso.remove();
    }
  }
  for (const n of SC(card)) n.remove();
  caixa.replaceChildren(card);
  foco = foco || card.querySelector('h1') || card.querySelector('[role=status]');
  return { p, foco };
}

function render() {
  if (atual.estado === 'pronto') { clearTimeout(relogio); sombra.replaceChildren(); hostEntrada.hidden = true; abrirTela(); return; }
  fecharTela(); hostEntrada.hidden = false;
  const { p, foco } = montar();
  const style = document.createElement('style');
  style.textContent = 'button{font:inherit;color:inherit}button:focus-visible,[tabindex]:focus-visible{outline:3px solid #2451B8;outline-offset:2px}h1[tabindex="-1"]:focus{outline:none}';
  sombra.replaceChildren(style, p);
  // D-025: no carregando o foco não se move.
  if (atual.estado !== 'carregando' && foco) { foco.tabIndex = -1; foco.focus({ preventScroll: true }); }
}

window.addEventListener('caderno-shell', e => {
  // Releitura na mesma sessão: o módulo aberto continua; o motor já avisou.
  if (e.detail.estado === 'pronto' && e.detail.releitura && tela) return;
  atual = e.detail; render();
});
window.addEventListener('resize', () => { if (atual.estado !== 'pronto') render(); });
render();
