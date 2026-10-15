// Variante agregada D006: seleção descritiva não cria vínculo banco/fatura.
const brl=v=>(v<0?'−':v>0?'+':'')+'R$ '+Math.abs(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const dm=k=>k.slice(8)+'/'+k.slice(5,7);
export function eventoCaixaView(fontes,modelo,mob,data,indice,acoes){
 const day=modelo.noDia(data,false),ev=day?.eventos[indice];if(!ev||! /fatura/i.test(ev.desc))return null;
 const doc=new DOMParser().parseFromString(fontes[mob?'D006_Celular':'D006_Fatura'],'text/html'),fonte=doc.querySelector('x-dc > div');
 const root=document.importNode(mob?fonte.children[1]:fonte,true);root.style.width='100%';root.style.fontFamily='Geist,system-ui,sans-serif';root.style.color='#16171A';
 if(mob){root.style.height='100vh';root.style.overflowY='auto';const back=root.firstElementChild;back.textContent='‹ '+dm(data);back.onclick=acoes.fechar;root.querySelector('h2').textContent=ev.desc;root.querySelector('b').textContent=brl(ev.valor);
  const values={Dia:dm(data)+'/'+data.slice(0,4),'Sai de':ev.meio,Situação:'previsto',Nota:ev.nota||null};for(const dt of [...root.querySelectorAll('dt')]){const dd=dt.nextElementSibling,v=values[dt.textContent];if(v===null){dt.remove();dd.remove();}else dd.textContent=v;}
 }else{
  root.style.minHeight='100vh';const main=root.querySelector('main');main.children[2].remove();main.querySelector('section[aria-label="Futuro"]').remove();main.firstElementChild.firstElementChild.textContent=new Date(data+'T12:00:00Z').toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).replace(/^./,c=>c.toUpperCase())+' · sem acerto';
  const grid=main.children[1],diaData=new Date(data+'T12:00:00Z'),domingo=new Date(diaData);domingo.setUTCDate(domingo.getUTCDate()-domingo.getUTCDay());
  [...grid.children].forEach((n,i)=>{const d=new Date(domingo);d.setUTCDate(d.getUTCDate()+i);const k=d.toISOString().slice(0,10),info=modelo.noDia(k,false);n.children[0].textContent=d.getUTCDate();n.children[1].textContent=info?(info.eventos.length?info.eventos.length+' evento'+(info.eventos.length>1?'s':''):'sem movimento'):'sem dado';n.children[2].textContent=info?Math.round(info.saldo).toLocaleString('pt-BR'):'';n.style.border=(k===data?'2px solid #16171A':info?.eventos.length?'1px dashed #6B6E76':'1px solid #DDDAD2');if(!info)n.style.background='repeating-linear-gradient(135deg,#ECEAE4 0 6px,#F4F3EF 6px 12px)';});
  const panel=root.querySelector('aside');panel.querySelector('button').onclick=acoes.fechar;panel.querySelector('h2').textContent=new Date(data+'T12:00:00Z').toLocaleDateString('pt-BR',{weekday:'long',timeZone:'UTC'}).replace('-feira','').replace(/^./,c=>c.toUpperCase())+', '+dm(data)+'/'+data.slice(0,4);panel.children[2].querySelector('b').textContent=brl(day.saldo).replace(/^\+/, '');
  const list=panel.children[3],samples=[...list.children];list.replaceChildren();const ordered=[{ev,index:indice},...day.eventos.map((ev,index)=>({ev,index})).filter(x=>x.index!==indice)];
  for(const {ev:e,index}of ordered){const n=samples[index===indice?0:e.tipo==='acerto'?2:1].cloneNode(true);n.children[0].textContent=e.desc;n.children[1].textContent=brl(e.valor);n.children[2].textContent=e.tipo==='acerto'?'não considerado (escolha “Com acerto previsto”)':[e.meio,'previsto',e.nota,e.fora_cartao?'fora do cartão':null].filter(Boolean).join(' · ');list.append(n);}
 }
 const target=[...root.querySelectorAll('button')].find(b=>b.textContent==='Abrir Transações');target.disabled=true;target.title='Indisponível nesta versão';
 root.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();acoes.fechar();}};
 return root;
}
