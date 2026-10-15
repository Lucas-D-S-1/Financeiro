import './producao-estados.mjs';
import {maisView,cabecalhoMais,barraIndividual,menuConta,saiuView,barraCelular} from './navegacao-view.mjs';
import {acertoView} from './acerto-view.mjs';
const casosOperacao={};
import {projecaoContratoView} from './projecao-contrato-view.mjs';
import fontes from './fontes-complementos.mjs';

import { eventoCaixaView } from './evento-caixa-view.mjs';

import { categoriasCaixaView } from './categorias-caixa-view.mjs';
import { calendarioCoberturaView } from './calendario-cobertura-view.mjs';
import { lerOperacao } from './operacao.mjs';
import { operacaoView } from './operacao-view.mjs';
import { lerProjecao } from './projecao.mjs';
const host=document.getElementById('complemento').attachShadow({mode:'open'});
const caso=document.querySelector('script[data-caso]')?.dataset.caso;const calendario=caso==='D005'||caso==='D006';
const casoCobertura=await window.cadernoExtratoEnvelope();
const pessoaSessao=window.cadernoPerfil();
let modeloSessao=null;try{modeloSessao=lerProjecao(casoCobertura,pessoaSessao);}catch{modeloSessao=null;}
const hojeIso=(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})();
const PADRAO=(()=>{if(!modeloSessao)return{mes:null,dia:null,indice:0};const meses=modeloSessao.meses;let i=meses.findIndex(m=>m.days.some(d=>d.data===hojeIso));if(i<0)i=0;const dia=meses[i].days.some(d=>d.data===hojeIso)?hojeIso:meses[i].days[0].data;return{mes:meses[i].key,dia,indice:i};})();
const casoFatura=casoCobertura;const pessoa=pessoaSessao;
const consulta=new URLSearchParams(location.search);let aplicado=false;
// Volta de uma tela aberta pelo Mais: foco no item de origem (D011).
let origemMais0=consulta.get('origem')==='investimentos'?'investimentos':null;
let maisAberto=!caso&&consulta.get('mais')==='1',origemMais=false,scrollMais=0,menuAberto=false,origemConta='topo',saida=false,focarTela=maisAberto;
function abrirMais(){if(caso){location.href='./caixa.html?mais=1';return;}maisAberto=true;selecao=null;origemMais=false;history.pushState({cadernoNav:'mais'},'');focarTela=true;render();}
function voltarMais(){history.back();}
function abrirConta(origem){if(menuAberto){fecharConta();return;}origemConta=origem;menuAberto=true;render();host.querySelector('[role=menu] button')?.focus();}
function fecharConta(){menuAberto=false;render();host.querySelector('[data-conta="'+origemConta+'"]')?.focus({preventScroll:true});}
function sairPreview(){saida=true;menuAberto=false;window.cadernoSairPreview();render();host.querySelector('[role=heading]')?.focus({preventScroll:true});}
const acoesNav={conta:abrirConta,voltar:voltarMais,categorias:()=>{scrollMais=host.children[1]?.children[1]?.scrollTop||0;maisAberto=false;origemMais=true;history.pushState({cadernoNav:'categorias'},'');focarTela=true;render();}};
let scrollOperacao={interno:0,janela:0};
let com=false,mesProj=PADRAO.mes,diaProj=null,evento=null,operacao=null,retornoOperacao=null,selecao=null,indice=PADRAO.indice,dia=PADRAO.dia,scroll=0,retorno=null;
function render(){
  if(saida){const manterFoco=host.activeElement?.getAttribute('role')==='heading';const style=document.createElement('style');style.textContent='button{font:inherit;color:inherit}';host.replaceChildren(style,saiuView(fontes));if(manterFoco)host.querySelector('[role=heading]')?.focus({preventScroll:true});return;}
  if(!window.__CASO_CAIXA_READY__||!window.cadernoCaixaEscopoAtivo?.()){if(aplicado){menuAberto=false;maisAberto=false;origemMais=false;scrollMais=0;focarTela=false;}host.replaceChildren();return;}
  const preservarTitulo=!caso&&host.activeElement?.matches('h1,[role=heading]');
  const manterDestino=host.activeElement?.dataset?.destino||null;
  const focarDetalheInicial=caso==='D013'&&(!aplicado||host.activeElement?.tagName==='H2');
  if(!aplicado){aplicado=true;if(!caso&&maisAberto)history.replaceState({cadernoNav:'mais'},'');const cat=consulta.get('categoria');if(caso==='D013'){history.replaceState({caderno:'lista'},'');if(pessoa==='Lucas'||consulta.get('abrir')==='acerto'){selecao='Acerto do casal';retorno='Acerto do casal';history.pushState({caderno:'acerto'},'');}}if(cat&&window.cadernoCaixaAtual()?.ordenadas.some(([c])=>c===cat))selecao=cat;const k=consulta.get('dia');if(k&&/^\d{4}-\d{2}-\d{2}$/.test(k)){const model=lerProjecao(casoCobertura,pessoa),i=model.meses.findIndex(m=>m.key===k.slice(0,7));if(i>=0&&new Date(k+'T12:00:00Z').toISOString().slice(0,10)===k){dia=k;indice=i;}}}
  const mob=innerWidth<1200;const exemplo=caso==='D003'?casosOperacao[new URLSearchParams(location.search).get('caso')]:null;
  const style=document.createElement('style');style.textContent="button,select,nav a{font:inherit;color:inherit}button:focus-visible,[role=button]:focus-visible,select:focus-visible{outline:2px solid #16171A;outline-offset:2px}.mais-voltar:focus-visible{outline:3px solid #2451B8;outline-offset:-2px}";
  const fecharOperacao=()=>{if(caso==='D013'&&history.state?.caderno==='operacao'){history.back();return;}operacao=null;render();if(host.children[1])host.children[1].scrollTop=scrollOperacao.interno;window.scrollTo(0,scrollOperacao.janela);[...host.querySelectorAll('[data-operacao],[data-acerto-id]')].find(n=>n.dataset.operacao===retornoOperacao||n.dataset.acertoId===retornoOperacao)?.focus({preventScroll:true});};
  const acoes={operacao:id=>{scrollOperacao={interno:host.children[1]?.scrollTop||0,janela:window.scrollY};const envelope=window.cadernoOperacao(id);const op=envelope&&lerOperacao(envelope,id,pessoa);if(!op)return;retornoOperacao=id;operacao=op;if(caso==='D013')history.pushState({caderno:'operacao',id},'');render();(host.querySelector('aside h2')||host.querySelector('h2'))?.focus();},mes:d=>{window.cadernoCaixaMes(d);selecao=null;render();},hoje:()=>{window.cadernoCaixaHoje();selecao=null;render();},modo:l=>{window.cadernoCaixaModo(l);render();host.querySelector('[aria-label="Como somar os reembolsos"] [aria-pressed="true"]')?.focus({preventScroll:true});},recorte:b=>{window.cadernoCaixaRecorte(b);render();},abrir:(cat,e)=>{retorno=cat;scroll=host.querySelector('main')?.scrollTop||host.children[1]?.children[1]?.scrollTop||0;selecao=cat;if(caso==='D013')history.pushState({caderno:'acerto'},'');render();const t=host.querySelector('aside h2')||host.querySelector('h2');if(t)t.tabIndex=-1;(t||host.querySelector('button'))?.focus();},fechar:()=>{if(caso==='D013'&&history.state?.caderno==='acerto'){history.back();return;}selecao=null;render();const body=host.querySelector('main')||host.children[1]?.children[1];if(body)body.scrollTop=scroll;[...host.querySelectorAll('[data-categoria]')].find(n=>n.dataset.categoria===retorno)?.focus({preventScroll:true});}};
  let view;
  if(!caso&&maisAberto&&mob)view=maisView(fontes,acoesNav);
  else if(exemplo){const op=lerOperacao(exemplo,'corrida','Lucas');view=operacaoView(fontes,op,mob,{fechar:()=>location.href='./caixa.html',contexto:exemplo.transacoes.map(r=>({id:r.id,data:r.data,nome:r.desc,valor:r.valor}))});}
  else if((caso==='D004'||calendario)&&!modeloSessao)view=window.cadernoEstadoAnalise(fontes,mob,caso==='D004'?'Projeção':'Calendário',casoCobertura,{conta:abrirConta});
  else if(caso==='D004'){const m=lerProjecao(casoCobertura,pessoa);view=projecaoContratoView(fontes,m,mob,mesProj,com,diaProj,window.cadernoProjecaoMensal(m.fonte,mesProj,com),{cenario:k=>{com=k;render();host.querySelector('[aria-label="Acerto do casal"] [aria-pressed="true"]')?.focus({preventScroll:true});},mes:k=>{mesProj=k;diaProj=null;render();host.querySelector('[aria-label="Mês da projeção"] [aria-pressed="true"],[aria-label="Mês"] [aria-pressed="true"]')?.focus({preventScroll:true});},dia:k=>{diaProj=k;if(k)mesProj=k.slice(0,7);render();const row=host.querySelector('[data-projecao-dia="'+k+'"]');row?.focus({preventScroll:true});row?.scrollIntoView({block:'nearest'});}});}
  else if(calendario){const m=lerProjecao(casoCobertura,pessoa);if(evento!==null)view=eventoCaixaView(fontes,m,mob,dia,evento,{fechar:()=>{const anterior=evento;evento=null;render();host.querySelector('[data-evento="'+anterior+'"]')?.focus({preventScroll:true});}});else view=calendarioCoberturaView(fontes,m,mob,indice,dia,{evento:i=>{evento=i;render();(host.querySelector('aside button')||host.querySelector('button'))?.focus();},dia:k=>{dia=k;render();host.querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});},mes:d=>{indice=Math.max(0,Math.min(m.meses.length-1,indice+d));dia=m.meses[indice].days.at(-1).data;render();}});}
  else if(operacao){const s=window.cadernoCaixaAtual();view=operacaoView(fontes,operacao,mob,{fechar:fecharOperacao,contexto:[...(s.detalhes[selecao]||[])].sort((a,b)=>Number(!!a.r.projetado)-Number(!!b.r.projetado)||a.r.data.split('/').reverse().join('').localeCompare(b.r.data.split('/').reverse().join(''))).map(({r,sinal})=>({id:r.id,projetado:r.projetado,data:r.data,nome:r.nome,valor:r.valor*sinal}))});}
  else if((caso==='D013'||window.__CASO_ACERTO__)&&selecao==='Acerto do casal'){const s=window.cadernoCaixaAtual(),model=window.cadernoAcerto();if(!model?.html){selecao=null;history.replaceState({caderno:'lista'},'');}const panel=acertoView(fontes,model,mob,{fechar:acoes.fechar,operacao:acoes.operacao},pessoa);if(panel&&mob)view=panel;else{view=categoriasCaixaView(fontes,s,mob,null,acoes);if(panel){view.querySelector('main').lastElementChild.append(panel);const row=view.querySelector('[data-categoria="Acerto do casal"]');if(row){row.setAttribute('aria-expanded','true');row.style.border='2px solid #16171A';}}}}
 else view=categoriasCaixaView(fontes,window.cadernoCaixaAtual(),mob,selecao,acoes);
  if(!caso){if(!mob)view.querySelector('nav')?.replaceWith(barraIndividual(fontes,'Categorias',acoesNav));else if(origemMais&&!maisAberto&&!selecao)cabecalhoMais(fontes,view,acoesNav);}
  if(mob&&(caso==='D004'||caso==='D005')&&!view.querySelector('nav')){view.append(barraCelular(fontes,caso==='D004'?'Projeção':'Calendário'));view.style.paddingBottom='76px';}
  if(caso==='D013'&&!mob){const nav=new DOMParser().parseFromString(fontes[pessoa==='Julia'?'D016_Julia_Desktop':'D013_Acerto'],'text/html').querySelector('nav');view.querySelector('nav')?.replaceWith(document.importNode(nav,true));}
  for(const n of view.querySelectorAll('nav span')){const label=n.textContent.trim();if(['Calendário','Categorias','Hoje','Extrato','Projeção','Casal e acerto'].includes(label)){const url={Hoje:'./hoje.html',Extrato:'./extrato.html',Calendário:'./calendario.html',Categorias:'./caixa.html',Projeção:'./projecao.html'}[label];n.setAttribute('role','link');if(url){n.tabIndex=0;n.onclick=()=>location.href=url;n.onkeydown=e=>{if(e.key==='Enter')location.href=url;};}else{n.setAttribute('aria-disabled','true');n.title='Indisponível: a área compartilhada ainda não existe na base';}}}
  for(const n of view.querySelectorAll('nav span'))if(n.textContent.trim()==='Mais'){n.setAttribute('role','link');n.tabIndex=0;n.onclick=abrirMais;n.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();abrirMais();}};}
  for(const b of view.querySelectorAll('header button[aria-haspopup=menu],nav button[aria-haspopup=menu]'))if(!b.dataset.conta){b.dataset.conta='topo';b.onclick=()=>abrirConta('topo');}
  if(menuAberto){const menu=menuConta(fontes,mob,{fechar:fecharConta,sair:sairPreview},pessoa);if(mob){for(const n of view.children)n.inert=true;view.append(menu);}else view.querySelector('nav')?.append(menu);for(const b of view.querySelectorAll('[data-conta]'))b.setAttribute('aria-expanded','true');}
  window.cadernoIdentidade(view,pessoa,mob);host.replaceChildren(style,view);if(maisAberto&&!caso&&(manterDestino||origemMais0)){const n=host.querySelector('[data-destino="'+(manterDestino||origemMais0)+'"]');if(n){focarTela=false;origemMais0=null;n.focus({preventScroll:true});}}if(focarDetalheInicial&&selecao)(host.querySelector('aside h2')||host.querySelector('h2'))?.focus({preventScroll:true});if(evento!==null&&(caso==='D006'||calendario))(host.querySelector('aside button')||host.querySelector('button'))?.focus({preventScroll:true});
  if(!menuAberto&&(focarTela||preservarTitulo)){const title=view.querySelector('h1,header [role=heading]')||view.querySelector('header')?.firstElementChild.lastElementChild;if(title){title.tabIndex=-1;title.focus({preventScroll:true});}focarTela=false;}
  host.onkeydown=e=>{if(e.key==='Tab'&&mob&&(selecao||operacao)){const focus=[...host.querySelectorAll('button:not([disabled]),select:not([disabled]),[role=button][tabindex]')].filter(n=>n.getBoundingClientRect().width>0);const active=host.activeElement;if(focus.length&&((e.shiftKey&&active===focus[0])||(!e.shiftKey&&active===focus.at(-1)))){e.preventDefault();(e.shiftKey?focus.at(-1):focus[0]).focus();}}if(e.key==='Escape'&&!operacao&&selecao){e.preventDefault();acoes.fechar();}};
}
window.addEventListener('caderno-categorias',render);
window.addEventListener('caderno-invalidar-sessao',()=>{menuAberto=false;maisAberto=false;origemMais=false;scrollMais=0;com=false;diaProj=null;evento=null;operacao=null;retornoOperacao=null;selecao=null;retorno=null;scroll=0;host.replaceChildren();});
window.addEventListener('resize',render);
document.addEventListener('DOMContentLoaded',()=>setTimeout(render,0));
setTimeout(render,0);

window.addEventListener('popstate',ev=>{if(caso!=='D013'||!window.cadernoCaixaEscopoAtivo?.())return;const veioDeOp=!!operacao;operacao=null;selecao=ev.state?.caderno==='lista'?null:'Acerto do casal';if(ev.state?.caderno==='operacao'){const env=window.cadernoOperacao(ev.state.id);operacao=env&&lerOperacao(env,ev.state.id,pessoa);}render();if(!selecao){const body=host.querySelector('main')||host.children[1]?.children[1];if(body)body.scrollTop=scroll;host.querySelector('[data-categoria="Acerto do casal"]')?.focus({preventScroll:true});}else if(veioDeOp){if(host.children[1])host.children[1].scrollTop=scrollOperacao.interno;window.scrollTo(0,scrollOperacao.janela);[...host.querySelectorAll('[data-acerto-id]')].find(n=>n.dataset.acertoId===retornoOperacao)?.focus({preventScroll:true});}else host.querySelector('h2')?.focus({preventScroll:true});});

window.addEventListener('popstate',ev=>{if(caso||!window.cadernoCaixaEscopoAtivo?.())return;if(ev.state?.cadernoNav==='mais'){maisAberto=true;origemMais=false;selecao=null;render();host.children[1].children[1].scrollTop=scrollMais;host.querySelector('[data-destino="categorias"]')?.focus({preventScroll:true});}else if(ev.state?.cadernoNav==='categorias'){maisAberto=false;origemMais=true;selecao=null;focarTela=true;render();}});
