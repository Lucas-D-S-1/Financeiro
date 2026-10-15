// D003 v3 somente leitura; componentes clonados das fontes aprovadas.
const brl=v=>(v<0?'−':'+')+'R$ '+Math.abs(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
export function operacaoView(fontes,op,mob,acoes){
 const doc=new DOMParser().parseFromString(fontes[mob?'D003_Celular':'D003_Operacao'],'text/html');
 const original=doc.querySelector('x-dc > div');const root=document.importNode(mob?original.firstElementChild:original,true);
 root.style.width='100%';root.style.fontFamily='Geist,system-ui,sans-serif';root.style.color='#16171A';
 if(mob){root.style.height='100vh';root.style.overflowY='auto';}else root.style.minHeight='100vh';
 const panel=mob?root:root.querySelector('aside');panel.setAttribute('aria-label','Operação '+op.nome);
 const h=panel.querySelector('h2');h.textContent=op.nome;h.tabIndex=-1;
 const originalNome=mob?h.nextElementSibling:h.parentElement.children[1];if(op.original)originalNome.lastElementChild.textContent=op.original;else originalNome.remove();
 const valor=mob?panel.querySelector('b'):h.parentElement.querySelector('b');valor.textContent=brl(op.valor);if(op.valor>=0)valor.style.color='#1C6B43';valor.nextElementSibling.textContent=op.direcao;
 const dl=panel.querySelector('dl');const fields={Data:op.data,Categoria:op.categoria,Tipo:op.tipo,Banco:op.banco,'Mês de caixa':op.caixa,Competência:op.competencia,Fatura:op.fatura?'vencimento em '+op.fatura+' (mês informado)':null,Origem:op.origem};
 for(const dt of [...dl.querySelectorAll('dt')]){const dd=dt.nextElementSibling,v=fields[dt.textContent];if(v===null||v===undefined){dt.remove();dd.remove();}else if(dt.textContent==='Fatura'){const nota=dd.lastElementChild?.cloneNode(true);if(nota){dd.replaceChildren(document.createTextNode('vencimento em '+op.fatura+' '),nota);}else dd.textContent=v;}else dd.textContent=v;}
 const correcao=dl.nextElementSibling;if(op.correcao){correcao.children[1].textContent='Categoria de '+op.correcao.de+' para '+op.correcao.para+(op.correcao.data?' · '+op.correcao.data:'');while(correcao.children.length>2)correcao.lastElementChild.remove();}else correcao.remove();
 if(op.pessoa==='Julia'&&!mob){const back=document.createElement('button');back.type='button';back.textContent='‹ Acerto do casal';back.style.cssText=doc.querySelector('aside button').style.cssText;back.style.width='auto';back.style.padding='0 8px';back.onclick=acoes.fechar;panel.firstElementChild.firstElementChild.replaceWith(back);}
 const fechar=mob?panel.firstElementChild:panel.querySelector('button[aria-label="Fechar (Esc)"]');if(mob)fechar.textContent='‹ '+op.categoria;fechar.onclick=acoes.fechar;
 if(!mob){const main=root.querySelector('main');main.lastElementChild.remove();main.querySelector('h1').textContent=op.categoria;const list=main.querySelector('div');list.replaceChildren();for(const [i,r] of acoes.contexto.entries()){const templates=doc.querySelector('main > div').children;const n=templates[r.id===op.id?2:i?1:0].cloneNode(true);n.children[0].textContent=r.projetado?'prev.':r.data.slice(0,5);n.children[1].textContent=r.nome;n.children[2].textContent=brl(r.valor).replace(/^\+/, '');list.append(n);}}
 root.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();acoes.fechar();}};
 return root;
}
