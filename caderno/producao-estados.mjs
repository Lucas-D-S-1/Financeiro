// Estados de produção que o preview resolvia com fixture. Nenhum desenho novo:
// pranchas D026/D012 aprovadas e a regra de identidade do D016.
import { barraIndividual } from './navegacao-view.mjs';

const parse = s => new DOMParser().parseFromString(s, 'text/html').querySelector('x-dc > div');
const clone = n => document.importNode(n, true);

// D-026 (L-005): análise diária própria ausente, com erro de leitura ou em
// formato que a tela não lê, DENTRO de Projeção e Calendário. Reusa o D012 no
// lugar do gráfico/grade (pranchas D026_Modulos e D026_Celular; formato
// inválido é a seção do D012_Analise / D012_Celular). A análise de outra pessoa nunca aparece
// no lugar. "Tentar de novo" relê só a análise, na mesma sessão.
export function estadoDaAnalise(envelope, leu) {
  if (leu) return null;
  if (envelope?.formato) return 'formato';
  if (envelope?.erro) return 'erro';
  // Chegou "disponível", mas o leitor da tela recusou: é formato, não ausência.
  return envelope?.disponivel === true ? 'formato' : 'sem';
}
let focouErro = false;
window.cadernoEstadoAnalise = (fontes, mob, ativo, envelope, acoes) => {
  const estado = estadoDaAnalise(envelope, false), projecao = ativo === 'Projeção';
  const naoE = projecao ? 'Isso não quer dizer saldo zero.' : 'Isso não quer dizer dias sem contas a pagar.';
  const sub = projecao ? 'Saldo da conta dia a dia' : 'Contas e saldo de cada dia';
  const tentar = () => location.reload();
  const pessoa = window.cadernoPerfil?.() || 'Lucas';
  let tela, lugar;
  if (mob) {
    tela = clone(parse(fontes.D026_Celular).querySelector('sc-for > div'));
    Object.assign(tela.style, { width: '100%', height: 'auto', minHeight: '100vh', overflow: 'visible' });
    tela.querySelector('nav').remove();
    const header = tela.querySelector('header'), [rotulo, titulo] = header.querySelector('span').children;
    rotulo.textContent = sub; titulo.textContent = ativo;
    const conta = header.querySelector('button'); conta.lastChild.textContent = pessoa; conta.setAttribute('aria-label', 'Conta: ' + pessoa);
    lugar = header.nextElementSibling;
  } else {
    tela = clone(parse(fontes.D026_Modulos).children[1]);
    Object.assign(tela.style, { width: '100%', minHeight: '100vh' });
    tela.querySelector('nav').replaceWith(barraIndividual(fontes, ativo, acoes));
    const main = tela.querySelector('main'), [rotulo, titulo] = main.firstElementChild.children;
    rotulo.textContent = sub; titulo.textContent = ativo;
    lugar = main;
  }
  const blocos = [...lugar.querySelectorAll(':scope > sc-if')];
  const [alternador, sem, erro] = blocos;
  if (!projecao) alternador.remove();
  let card = null;
  if (estado === 'sem') { card = sem.querySelector('section'); card.querySelector('p').textContent = naoE + ' A análise de outra pessoa nunca aparece no lugar.'; }
  else if (estado === 'erro') {
    card = erro.querySelector('section');
    card.querySelector('p').textContent = 'A base respondeu: “' + String(envelope.erro) + '”. Nada foi alterado na base. ' + naoE;
    card.querySelector('button').onclick = tentar;
  } else {
    card = clone(parse(mob ? fontes.D012_Celular : fontes.D012_Analise).querySelector('section[role=alert][aria-labelledby$="inv"],section[role=alert][aria-labelledby="inv-titulo"]'));
    card.querySelector('button').onclick = tentar;
  }
  if (projecao) alternador.replaceWith(...alternador.childNodes);
  (estado === 'erro' ? erro : sem).replaceWith(card);
  (estado === 'erro' ? sem : erro).remove();
  if (estado !== 'sem' && !focouErro) { focouErro = true; const h2 = card.querySelector('h2'); setTimeout(() => h2.isConnected && h2.focus({ preventScroll: true }), 0); }
  return tela;
};

// D001/D016: verde-água para a Julia, lima para o Lucas, com o nome escrito.
// Mesma regra que categorias-caixa-view.mjs aplica; aqui para os demais módulos.
window.cadernoIdentidade = (view, pessoa, mob) => {
  if (pessoa !== 'Julia' || !view) return;
  for (const n of view.querySelectorAll('*')) {
    if (n.style.backgroundColor === 'rgb(200, 240, 74)') {
      const navMob = n.closest('nav') && mob;
      n.style.backgroundColor = navMob ? '#2FB79B' : '#8EE6D3';
      if (navMob) n.style.boxShadow = 'none';
    }
  }
  for (const s of view.querySelectorAll('nav span, header span, [role=menu] span')) {
    if (s.children.length) continue;
    if (s.textContent === 'Lucas') s.textContent = 'Julia';
    else if (s.textContent === 'Com a Julia') s.textContent = 'Com o Lucas';
  }
};
