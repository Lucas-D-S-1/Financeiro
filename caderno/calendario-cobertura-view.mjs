import { montarTemplate } from './template.mjs';
const brl=v=>(v<0?'−':'')+'R$ '+Math.abs(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const dm=k=>k.slice(8)+'/'+k.slice(5,7);
export function calendarioCoberturaView(fontes,modelo,mob,indice,selecionado,acoes) {
  const fonte=fontes[mob?'D005_Celular':'D005_Calendario'];
  const d=new DOMParser().parseFromString(fonte,'text/html').querySelector('x-dc');
  d.querySelector('helmet')?.remove();
  const template=document.createElement('template');template.innerHTML=d.innerHTML;
  const m=modelo.meses[indice],primeiro=[...modelo.dias.keys()][0],ultimo=[...modelo.dias.keys()].at(-1);
  const ano=Number(m.key.slice(0,4)),mes=Number(m.key.slice(5));
  const nome=new Date(Date.UTC(ano,mes-1,1)).toLocaleDateString('pt-BR',{month:'long',timeZone:'UTC'});
  const nomeM=nome[0].toUpperCase()+nome.slice(1)+' de '+ano;
  const seta=off=>'width:44px;height:44px;background:#FFFFFF;border:1px solid #DDDAD2;border-radius:10px;opacity:'+(off?'.35':'1');
  const celulas=[];for(let i=0;i<new Date(Date.UTC(ano,mes-1,1)).getUTCDay();i++)celulas.push({num:'',info:'',saldo:'',saldoCor:'#16171A',numEstilo:'font-size:14px',estilo:'min-height:'+(mob?'44':'96')+'px',data:null});
  for(let n=1;n<=new Date(Date.UTC(ano,mes,0)).getUTCDate();n++){
    const k=m.key+'-'+String(n).padStart(2,'0'),dia=modelo.noDia(k,false),fora=!dia,abre=k===primeiro&&modelo.fonte.abertura===true,sel=k===selecionado,ev=dia?.eventos||[];
    const base=mob?'min-height:44px;display:flex;align-items:center;justify-content:center;font-size:14px;border-radius:8px;box-sizing:border-box;':'min-height:96px;box-sizing:border-box;padding:8px;border-radius:10px;display:flex;flex-direction:column;gap:2px;';
    const estilo=base+(fora?'color:#6B6E76;background:repeating-linear-gradient(135deg,#ECEAE4 0 '+(mob?'4':'6')+'px,#F4F3EF '+(mob?'4':'6')+'px '+(mob?'8':'12')+'px)'+(mob?(sel?';border:2px solid #16171A':''):';border:1px solid #DDDAD2')
      :mob&&abre?'background:#C8F04A;font-weight:600':'background:#FFFFFF;border:'+(sel?'2px solid #16171A':ev.length?'1px dashed #6B6E76':'1px solid #DDDAD2'));
    celulas.push({num:n,data:k,estilo,numEstilo:'align-self:flex-start;font-size:14px;font-weight:600;padding:0 4px;border-radius:4px;background:'+(abre?'#C8F04A':'transparent')+';color:'+(fora?'#6B6E76':'#16171A'),info:fora?'sem dado':abre?'abertura confirmada':k===primeiro?'início da análise':ev.length?ev.length+(ev.length===1?' evento':' eventos'):'sem movimento',saldo:fora?'':(dia.saldo<0?'−':'')+Math.round(Math.abs(dia.saldo)).toLocaleString('pt-BR'),saldoCor:dia?.saldo<0?'#B3261E':'#16171A'});
  }
  const sel=modelo.noDia(selecionado,false),data=new Date(selecionado+'T12:00:00Z');
  const titulo=data.toLocaleDateString('pt-BR',{weekday:'long'}).replace('-feira','');
  const diaTitulo=titulo[0].toUpperCase()+titulo.slice(1)+', '+dm(selecionado)+(mob?'':'/'+selecionado.slice(0,4));
  const noData='Sem dado para este dia: a análise '+(selecionado<primeiro?'começa em '+dm(primeiro):'vai até '+dm(ultimo))+'. Não é saldo zero.';
  const diaTexto=!sel?noData:sel.eventos.length?'':selecionado===ultimo?'Sem movimento previsto. Último dia da análise; a seta › fica desabilitada: “A análise vai até '+dm(ultimo)+'.”':'Sem movimento previsto.';
  // D-021 (L-005): só abertura === true é abertura confirmada; o texto acompanha o que a célula mostra.
  const nota=indice===0?(modelo.fonte.abertura===true?'Dias antes da abertura: hachurados, sem saldo. '+dm(primeiro)+' em lima = abertura confirmada.':'Dias antes do início da análise: hachurados, sem saldo. '+dm(primeiro)+' com borda = início da análise.'):'Tracejado = há eventos previstos; borda contínua = dia coberto sem movimento.';
  if(modelo.fonte.abertura!==true){const c=celulas.find(c=>c.data===primeiro);if(c){c.numEstilo+=';border:1px solid #16171A';if(mob)c.estilo='min-height:44px;display:flex;align-items:center;justify-content:center;font-size:14px;border-radius:8px;box-sizing:border-box;border:1px solid #16171A';}}
  const ctx={semana:mob?['D','S','T','Q','Q','S','S']:['dom','seg','ter','qua','qui','sex','sáb'],celulas,telas:[{mes:nomeM,setaAnt:seta(indice===0),setaSeg:seta(indice===modelo.meses.length-1),celulas,diaTitulo,diaSaldo:sel?brl(sel.saldo):'—',diaTexto,nota}]};
  const frag=montarTemplate(template,ctx),root=frag.firstElementChild;
  if(mob){const phone=root.firstElementChild;phone.style.width='100%';phone.style.height='100vh';phone.style.fontFamily='Geist,system-ui,sans-serif';phone.style.color='#16171A';root.replaceWith(phone);return finalizar(phone);}
  root.style.width='100%';root.style.minHeight='100vh';return finalizar(root);
  function finalizar(root){
    if(!mob){const main=root.querySelector('main');const head=main.children[0];head.firstElementChild.textContent='Análise de '+dm(primeiro)+' a '+dm(ultimo)+' · sem acerto';const nav=main.children[1];nav.children[1].textContent=nomeM;nav.lastElementChild.textContent=indice===0?'A análise começa em '+dm(primeiro)+'; não há mês anterior.':indice===modelo.meses.length-1?'A análise vai até '+dm(ultimo)+'.':'';
      const aside=root.querySelector('aside');aside.setAttribute('aria-label','Dia '+dm(selecionado));aside.querySelector('h2').textContent=diaTitulo;const saldo=aside.querySelector('h2').nextElementSibling;saldo.replaceChildren(document.createTextNode('Conta no fim do dia: '));if(sel){const b=document.createElement('b');b.style.cssText="font-family:'Geist Mono',monospace;font-weight:500";b.textContent=brl(sel.saldo);saldo.append(b);}else saldo.textContent='—';const lista=saldo.nextElementSibling;const ex=lista.firstElementChild.cloneNode(true);lista.replaceChildren();if(sel)for(const [index,ev] of sel.eventos.entries()){const item=ex.cloneNode(true);item.children[0].textContent=ev.desc;item.children[1].textContent=(ev.valor>0?'+':'')+brl(ev.valor);item.children[2].textContent=ev.tipo==='acerto'?'não considerado':'previsto'+(ev.meio?' · '+ev.meio:'')+(ev.nota?' · '+ev.nota:'')+(ev.fora_cartao?' · fora do cartão':'');if(ev.tipo==='acerto')item.style.color='#6B6E76';if(/fatura/i.test(ev.desc)&&acoes.evento){item.setAttribute('role','button');item.dataset.evento=index;item.tabIndex=0;item.onclick=()=>acoes.evento(index);item.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();acoes.evento(index);}};}lista.append(item);}else lista.textContent=noData;if(sel&&!sel.eventos.length)lista.textContent='Sem movimento previsto.';aside.lastElementChild.remove();main.lastElementChild.remove();}
    if(mob){
      root.style.overflowY='auto';root.firstElementChild.firstElementChild.textContent='análise de '+dm(primeiro)+' a '+dm(ultimo);
      if(sel?.eventos.length){const card=root.children[3];card.lastElementChild.remove();
        const d6=new DOMParser().parseFromString(fontes.D006_Celular,'text/html');const ex=d6.querySelector('x-dc > div > div > div > div:nth-child(3)');
        for(const [index,ev] of sel.eventos.entries()){const item=ex.cloneNode(true);item.children[0].textContent=ev.desc;item.children[1].textContent=(ev.valor>0?'+':'')+brl(ev.valor);item.children[2].textContent=ev.tipo==='acerto'?'não considerado':'previsto'+(ev.meio?' · '+ev.meio:'')+(ev.nota?' · '+ev.nota:'')+(ev.fora_cartao?' · fora do cartão':'');if(ev.tipo==='acerto')item.style.color='#6B6E76';if(/fatura/i.test(ev.desc)&&acoes.evento){const btn=d6.querySelector('x-dc > div > div button').cloneNode(true);btn.children[0].textContent=ev.desc;btn.children[1].textContent=(ev.valor>0?'+':'')+brl(ev.valor);btn.children[2].textContent=[ev.meio,'previsto'].filter(Boolean).join(' · ');btn.setAttribute('aria-expanded','false');btn.dataset.evento=index;btn.onclick=()=>acoes.evento(index);card.append(btn);}else card.append(item);}
      }
    }
    if(modelo.fonte.abertura!==true){for(const n of root.querySelectorAll('span'))if(n.childNodes.length&&n.lastChild.nodeType===3&&n.lastChild.textContent==='abertura confirmada'){n.lastChild.textContent='início da análise';n.firstElementChild.style.background='transparent';n.firstElementChild.style.border='1px solid #16171A';}}
    const cells=mob?root.children[2].children:root.querySelector('main').children[3].firstElementChild.children;
    let i=0;for(const n of cells){if(i++<7)continue;const c=celulas[i-8];if(!c?.data)continue;n.setAttribute('role','button');n.tabIndex=0;n.setAttribute('aria-label','Dia '+c.num+(modelo.dias.has(c.data)?': saldo '+brl(modelo.noDia(c.data).saldo):': sem dado'));n.setAttribute('aria-pressed',String(c.data===selecionado));n.onclick=()=>acoes.dia(c.data);n.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();acoes.dia(c.data);}};}
    const arrows=[...root.querySelectorAll('button')];for(const b of arrows){if(b.textContent==='‹'){b.disabled=indice===0;b.onclick=()=>acoes.mes(-1);b.title='A análise começa em '+dm(primeiro);}if(b.textContent==='›'){b.disabled=indice===modelo.meses.length-1;b.onclick=()=>acoes.mes(1);b.title='A análise vai até '+dm(ultimo);}}
    return root;
  }
}
