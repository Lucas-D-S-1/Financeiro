// D011 / D001 v2: apenas fontes aprovadas; este controlador usa identidade de fixture.
const parse=s=>new DOMParser().parseFromString(s,'text/html').querySelector('x-dc > div');
const clone=n=>document.importNode(n,true);
export function maisView(fontes,acoes){
 const root=clone(parse(fontes.D011_Mais_Celular).children[0]);root.style.width='100%';root.style.height='100vh';root.style.fontFamily='Geist,system-ui,sans-serif';root.style.color='#16171A';
 const body=root.children[1];body.style.overflowY='auto';body.style.minHeight='0';for(const n of body.children)n.style.flexShrink='0';
 const title=root.querySelector('header').firstElementChild.lastElementChild;title.setAttribute('role','heading');title.setAttribute('aria-level','1');title.tabIndex=-1;
 for(const b of body.querySelectorAll('button')){const nome=b.querySelector('span')?.textContent||b.textContent;if(nome.startsWith('Categorias')){b.dataset.destino='categorias';b.onclick=acoes.categorias;}else if(nome.startsWith('Investimentos')){b.dataset.destino='investimentos';b.onclick=()=>{history.replaceState(history.state,'','./caixa.html?mais=1&origem=investimentos');location.href='./investimentos.html?via=mais';};}else if(nome.startsWith('Sua conta')){b.dataset.conta='mais';b.onclick=()=>acoes.conta('mais');}}
 const conta=root.querySelector('header button');conta.dataset.conta='topo';conta.onclick=()=>acoes.conta('topo');return root;
}
export function cabecalhoMais(fontes,root,acoes){
 const header=clone(parse(fontes.D011_Mais_Celular).children[2].firstElementChild),titulo=header.firstElementChild.lastElementChild;
 titulo.textContent='Categorias';titulo.setAttribute('role','heading');titulo.setAttribute('aria-level','1');titulo.tabIndex=-1;
 const voltar=header.querySelector('button');voltar.style.removeProperty('outline');voltar.style.removeProperty('outline-offset');voltar.className='mais-voltar';voltar.onclick=acoes.voltar;
 const conta=header.lastElementChild;conta.dataset.conta='topo';conta.onclick=()=>acoes.conta('topo');root.querySelector('header').replaceWith(header);
}
export function barraIndividual(fontes,ativo,acoes,pessoa=window.cadernoPerfil?.()){
 const nav=clone(parse(fontes.D011_Navegacao).querySelector('nav'));
 for(const a of nav.querySelectorAll('a')){const n=a.textContent;a.removeAttribute('aria-current');a.style.removeProperty('background');a.style.removeProperty('border-radius');a.style.removeProperty('font-weight');if(n===ativo){a.setAttribute('aria-current','page');a.style.background='#C8F04A';a.style.borderRadius='8px';a.style.fontWeight='600';}const url={Hoje:'./hoje.html',Extrato:'./extrato.html',Categorias:'./caixa.html',Calendário:'./calendario.html',Projeção:'./projecao.html',Investimentos:'./investimentos.html'}[n];if(url){a.href=url;}else{a.removeAttribute('href');a.setAttribute('aria-disabled','true');a.tabIndex=0;a.title='Indisponível nesta versão';a.textContent=n+' · indisponível';}}
 if(pessoa==='Julia'){nav.querySelector('button[aria-haspopup]').replaceWith(clone(parse(fontes.D016_Julia_Desktop).querySelector('nav button[aria-haspopup]')));for(const s of nav.querySelectorAll('span'))if(s.textContent==='Com a Julia')s.textContent='Com o Lucas';}const conta=nav.querySelector('button[aria-haspopup]');conta.dataset.conta='topo';conta.onclick=()=>acoes.conta('topo');nav.style.position='relative';return nav;
}
export function menuConta(fontes,mob,acoes,pessoa='Lucas'){
 // Fontes D001 v2 já são da Julia; só o Lucas recebe a identidade fixture do D011.
 const lucas=pessoa==='Lucas';
 let root,menu;
 if(mob){root=clone(parse(fontes.D001_Celular_v2).children[1]);root.style.cssText+=';position:fixed;inset:0;width:100%;height:100vh;z-index:60;font-family:Geist,system-ui,sans-serif;color:#16171A';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Conta');menu=root.querySelector('[role=menu]');if(lucas){const identidade=menu.children[1];identidade.lastChild.textContent='Lucas · seu painel';identidade.firstElementChild.style.background='#C8F04A';menu.children[2].textContent='entrou como lucas@exemplo.com';menu.children[3].textContent='Só você vê este painel. Com a Julia você divide apenas Casal e acerto.';}root.onclick=e=>{if(e.target===root)acoes.fechar();};}
 else{root=clone(parse(fontes.D001_Alvo_v2).querySelector('[role=menu]'));menu=root;if(lucas){menu.firstElementChild.textContent='entrou como lucas@exemplo.com';menu.children[1].textContent='Só você vê este painel. Com a Julia você divide apenas Casal e acerto.';}}
 for(const s of menu.querySelectorAll('span'))if(/^entrou como /.test(s.textContent))s.textContent='entrou como '+(window.cadernoEmail?.()||'');
 for(const b of menu.querySelectorAll('button'))b.onclick=b.textContent==='Sair'?acoes.sair:acoes.fechar;
 root.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();acoes.fechar();}if(e.key==='Tab'){const focus=[...menu.querySelectorAll('button')];const active=menu.getRootNode().activeElement;if((e.shiftKey&&active===focus[0])||(!e.shiftKey&&active===focus.at(-1))){e.preventDefault();(e.shiftKey?focus.at(-1):focus[0]).focus();}}};return root;
}
export function saiuView(fontes){
 const original=parse(fontes.D001_Estados_v2),sec=[...original.querySelectorAll('section')].find(n=>n.firstElementChild.textContent.startsWith('8 ·')),root=clone(original),card=clone(sec.children[1]);root.replaceChildren(card);root.style.width='100%';root.style.height='auto';root.style.minHeight='100vh';if(innerWidth<1200)root.style.gridTemplateColumns='minmax(0,1fr)';root.style.fontFamily='Geist,system-ui,sans-serif';root.style.color='#16171A';card.firstElementChild.setAttribute('role','heading');card.firstElementChild.setAttribute('aria-level','1');card.firstElementChild.tabIndex=-1;card.querySelector('button').disabled=true;card.querySelector('button').title='';return root;
}
// Barra inferior do D011 (mesmo componente de Hoje/Extrato) com o item atual marcado; sem destinos novos.
export function barraCelular(fontes,ativo){
 const nav=clone(parse(fontes.D011_Mais_Celular).children[0].querySelector('nav'));const itens=[...nav.children],atual=itens.find(n=>n.getAttribute('aria-current')),comum=itens.find(n=>!n.getAttribute('aria-current'));
 const marca=atual.firstElementChild;
 for(const n of itens){const nome=n.textContent.trim();n.removeAttribute('aria-current');n.style.cssText=comum.style.cssText;n.textContent=nome;if(nome===ativo){n.setAttribute('aria-current','page');n.style.cssText=atual.style.cssText;n.prepend(clone(marca));}}
 Object.assign(nav.style,{position:'fixed',left:'0',right:'0',bottom:'0',zIndex:'30',boxSizing:'border-box'});return nav;
}
