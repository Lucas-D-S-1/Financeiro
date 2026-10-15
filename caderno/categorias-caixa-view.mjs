// Layouts clonados das fontes D-002; todos os valores vêm do motor existente.
const brl = v => (v < 0 ? '−' : '') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const text = (el, value) => { el.textContent = String(value ?? ''); };
const parse = fonte => new DOMParser().parseFromString(fonte,'text/html').querySelector('x-dc');
const clone = el => document.importNode(el,true);
const nomeMes = m => new Date(Date.UTC(m.y,m.m-1,1)).toLocaleDateString('pt-BR',{month:'long',timeZone:'UTC'});
export function categoriasCaixaView(fontes,s,mob,selecao,acoes) {
  const doc = parse(fontes[mob?'D002_Celular':'Main']);
  const roots = [...doc.children].filter(n=>n.tagName!=='HELMET');
  let root = clone(roots[0]);
  if(mob){const phones=[...root.children];root=clone(phones[selecao&&selecao!=='Acerto do casal'?1:0]);root.style.width='100%';root.style.height='100vh';root.style.fontFamily='Geist,system-ui,sans-serif';root.style.color='#16171A';}
  else{root.style.width='100%';root.style.minHeight='100vh';}
  const mes=nomeMes(s.mes),titulo=mes[0].toUpperCase()+mes.slice(1)+' de '+s.mes.y;
  const categorias = s.ordenadas.map(([cat,valor])=>({cat,valor,nome:s.rotulos[cat],orcamento:s.orcamentos[cat]||0,fixo:s.fixoPorCat[cat]||0,bancos:Object.entries(s.bancoPorCat[cat]||{}).filter(([,v])=>v>.005).sort((a,b)=>b[1]-a[1])}));
  if(window.__CASO_ACERTO__&&typeof s.porCat['Acerto do casal']==='number'&&!categorias.some(c=>c.cat==='Acerto do casal')&&s.txs.some(r=>r.cat==='Acerto do casal'))categorias.push({cat:'Acerto do casal',valor:s.porCat['Acerto do casal'],nome:'Acerto do casal',orcamento:0,fixo:0,bancos:[]});
  const outro=s.perfil==='Julia'?'Lucas':'Julia';
  const atual=categorias.find(c=>c.cat===selecao&&c.cat!=='Acerto do casal');
  const status=c=>c.orcamento?c.valor/c.orcamento>1?'acima do limite':c.valor/c.orcamento>.85?'perto do limite':'dentro do limite':'sem meta definida';
  const cor=c=>c.valor<0?'#1C6B43':c.orcamento&&c.valor/c.orcamento>1?'#B3261E':c.orcamento&&c.valor/c.orcamento>.85?'#7A4A00':'#4A4D55';
  function controles(){
    for(const b of root.querySelectorAll('button')) {
      if(b.textContent==='‹')b.onclick=()=>acoes.mes(-1);
      else if(b.textContent==='›')b.onclick=()=>acoes.mes(1);
      else if(b.textContent==='mês atual')b.onclick=acoes.hoje;
      else if(['Líquido','Bruto'].includes(b.textContent)){
        const ligado=(b.textContent==='Líquido')===s.liquido;b.setAttribute('aria-pressed',String(ligado));b.style.background=ligado?'#FFFFFF':'transparent';b.style.fontWeight=ligado?'600':'400';b.onclick=()=>acoes.modo(b.textContent==='Líquido');
      }else if(b.textContent.startsWith('Rachar com a Julia')){if(s.perfil==='Julia'){b.remove();continue;}b.disabled=true;b.title='Indisponível: definição de privacidade pendente';}
    }
    for(const span of root.querySelectorAll('span'))if(span.textContent==='Outubro de 2026')text(span,titulo);
    for(const span of root.querySelectorAll('span'))if(span.textContent==='Outubro de 2026 · mês de caixa'||span.textContent==='outubro de 2026 · mês de caixa')text(span,titulo+' · mês de caixa');
    const select=root.querySelector('select');if(select){select.style.minWidth='0';select.parentElement.style.minWidth='0';select.replaceChildren();for(const [valor,rotulo] of [['','Todas as contas'+(mob?'':' e cartões')],...s.bancos.map(b=>[b,'Só o cartão '+b])]){const o=document.createElement('option');o.value=valor;text(o,rotulo);select.append(o);}select.value=s.recorte;select.onchange=()=>acoes.recorte(select.value);}
  }
  function linha(c){
    const candidates=mob?roots[0].children[0].children[1].querySelectorAll('button'):doc.querySelector('section[aria-label="Gastos por categoria"]').querySelectorAll('button');
    const ex=[...candidates].find(b=>b.textContent.includes(c.nome))||[...candidates].find(b=>b.textContent.includes('Alimentação'));
    const el=clone(ex);el.dataset.categoria=c.cat;el.setAttribute('aria-expanded',String(c.cat===selecao));el.onclick=e=>acoes.abrir(c.cat,e);if(c.cat==='Acerto do casal'&&!window.__CASO_ACERTO__){el.disabled=true;el.title='Indisponível: a área compartilhada ainda não veio da base';}el.style.border=(c.cat===selecao?'2px solid #16171A':'1px solid '+(c.valor<0?'#B9DCC6':'#DDDAD2'));el.style.background=c.valor<0?'#E7F3EC':'#FFFFFF';
    const filhos=[...el.children];
    if(mob){text(filhos[0],c.nome);text(filhos[1],brl(c.valor));filhos[1].style.color=c.valor<0?'#1C6B43':'#16171A';text(filhos[2],c.valor<0?(c.cat==='Acerto do casal'?'saldo estimado a receber de '+outro:'volta pro bolso quando '+outro+' acertar'):status(c)+(c.orcamento?' · '+(c.valor/c.orcamento>1?brl(c.valor-c.orcamento)+' a mais':Math.floor(c.valor/c.orcamento*100)+'% de R$ '+Math.round(c.orcamento)):''));filhos[2].style.color=cor(c);text(filhos[3],c.fixo?'fixo':'');}
    else {
      filhos[0].replaceChildren();const n=document.createElement('span');n.style.cssText='font-size:16px;font-weight:'+(c.cat===selecao?'600':'500');text(n,c.nome);filhos[0].append(n);filhos[0].style.cssText='display:flex;flex-direction:column;gap:'+(c.valor<0?'3':'4')+'px';
      if(c.fixo){const f=document.createElement('span');f.style.cssText='align-self:flex-start;font-size:12px;padding:1px 7px;border-radius:999px;background:#ECEAE4';text(f,'fixo '+brl(c.fixo));filhos[0].append(f);}
      if(c.bancos.length>=2){const chips=document.createElement('span');chips.style.cssText='display:flex;gap:4px;flex-wrap:wrap';for(const [b,v]of c.bancos){const chip=document.createElement('span');chip.style.cssText='font-size:12px;padding:1px 7px;border-radius:999px;border:1px solid #A9A69D';text(chip,b+' '+brl(v));chips.append(chip);}filhos[0].append(chips);}
      if(c.orcamento&&c.valor>=0){const bar=filhos[1].firstElementChild?.firstElementChild;if(bar){bar.style.width=Math.min(Math.floor(c.valor/c.orcamento*100),100)+'%';bar.style.background=cor(c)==='#7A4A00'?'#B86E00':cor(c)==='#B3261E'?'#B3261E':'#16171A';}const st=filhos[1].lastElementChild;text(st,status(c)+' · '+(c.valor/c.orcamento>1?brl(c.valor-c.orcamento)+' a mais':Math.floor(c.valor/c.orcamento*100)+'%'));st.style.color=cor(c);}
      else{text(filhos[1],c.cat==='Acerto do casal'?'sem orçamento: é acerto entre os dois':'sem meta definida');filhos[1].style.fontSize='12px';if(c.valor<0)filhos[1].style.color='#1C4E33';}
      if(c.valor<0){const nota=document.createElement('span');nota.style.cssText='font-size:12px;color:#1C4E33';text(nota,c.cat==='Acerto do casal'?'saldo estimado a receber de '+outro:'volta pro bolso quando '+outro+' acertar');filhos[0].append(nota);}
      filhos[2].style.color=c.valor<0?'#1C6B43':'#16171A';if(c.valor<0||!filhos[2].firstElementChild)text(filhos[2],brl(c.valor));else{text(filhos[2].firstElementChild,brl(c.valor));text(filhos[2].lastElementChild,c.orcamento?'de '+brl(c.orcamento):'');}
    }
    if(s.perfil==='Julia'&&c.cat==='Acerto do casal'&&c.valor>0){const nota=document.createElement('span');nota.style.cssText='font-size:12px;color:#7A4A00';nota.textContent='saldo estimado a pagar a Lucas';if(mob){text(filhos[2],nota.textContent);filhos[2].style.color='#7A4A00';}else filhos[0].append(nota);}
    return el;
  }
  function detalhe(container,c){
    const items=[...(s.detalhes[c.cat]||[])].sort((a,b)=>Number(!!a.r.projetado)-Number(!!b.r.projetado)||a.r.data.split('/').reverse().join('').localeCompare(b.r.data.split('/').reverse().join('')));
    const h=container.querySelector('h2');text(h,c.nome);
    const desc=h.nextElementSibling;if(mob){const st=desc.lastElementChild?.cloneNode(true)||document.createElement('span');st.textContent=status(c);st.style.color=cor(c);desc.replaceChildren(document.createTextNode(brl(c.valor)+(c.orcamento?' de '+brl(c.orcamento):'')+' · '),st);}else text(desc,brl(c.valor)+(c.orcamento?' de '+brl(c.orcamento):'')+' · '+mes+', mês de caixa');
    const lista=desc.nextElementSibling;const originais=[...lista.children];lista.replaceChildren();
    for(const {r,sinal}of items){const ex=originais.find(n=>n.textContent.includes(r.projetado?'prev.':r.data.slice(0,5)))||originais[0];const el=clone(ex);const f=[...el.children];text(f[0],r.projetado?'prev.':r.data.slice(0,5));
      if(mob){const name=r.nome.replace(/\s+·\s+em processamento$/i,'');if(f[1].children.length){text(f[1].firstElementChild,name);while(f[1].children.length>1)f[1].lastElementChild.remove();}else text(f[1],name);}else{const n=f[1].firstElementChild;n.replaceChildren(document.createTextNode(r.nome.replace(/\s+·\s+em processamento$/i,'')));text(f[1].lastElementChild,r.tipo+(r.parcTotal>1?' '+r.parcAtual+'/'+r.parcTotal:'')+(r.projetado?' · previsão':''));}
      if(/\s+·\s+em processamento$/i.test(r.desc)){const selo=document.createElement('span');selo.style.cssText='align-self:flex-start;font-size:11px;padding:1px 6px;border-radius:999px;border:1px solid #B86E00;color:#7A4A00;white-space:nowrap';text(selo,'em processamento');if(mob){f[1].style.cssText='display:flex;flex-direction:column;gap:3px';f[1].append(selo);}else f[1].firstElementChild.append(document.createTextNode(' '),selo);}
      text(f[2],c.cat==='Acerto do casal'?brl(r.valor*(sinal<0?1:-1)):brl(r.valor*sinal));f[2].style.color=sinal<0?'#1C6B43':'#16171A';if(el.tagName==='BUTTON'){el.dataset.operacao=r.id;const pode=!!acoes.operacao&&!r.projetado&&r.produto!=='sintetico';el.disabled=!pode;el.title=pode?'Abrir operação somente leitura':'Previsão sem operação na base';if(pode)el.onclick=()=>acoes.operacao(r.id);}lista.append(el);
    }
    container.setAttribute('aria-label','Categoria '+c.nome);
    if(mob)container.firstElementChild.lastElementChild.textContent=mes+' · caixa · '+(s.liquido?'líquido':'bruto');
    const rod=lista.nextElementSibling;text(rod.firstElementChild,items.length+' lançamentos');text(rod.lastElementChild,brl(c.valor));
    const fechar=container.querySelector('button[aria-label="Fechar (Esc)"]')||container.querySelector('button');fechar.onclick=acoes.fechar;
    container.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();acoes.fechar();}};
  }
  if(mob&&atual){root.style.overflowY='auto';detalhe(root,atual);return root;}
  controles();
  const explicacao=root.querySelector('main > p');if(explicacao&&explicacao.firstChild?.nodeType===3)explicacao.firstChild.textContent=explicacao.firstChild.textContent.replace('em outubro','em '+mes);

  if(mob){const body=root.children[1];body.style.overflowY='auto';body.style.minHeight='0';const antigos=[...body.children].filter(n=>n.tagName==='BUTTON'&&n.style.display==='grid');for(const n of antigos)n.remove();const nota=[...body.children].find(n=>n.textContent.startsWith('… Lazer'));nota?.remove();for(const c of categorias)body.append(linha(c));
    const desktop=parse(fontes.Main).querySelector('section[aria-label="Gastos por categoria"]');
    if(categorias.length&&Math.abs(s.residuo)>.5){const n=clone([...desktop.children].find(n=>n.textContent.trim().startsWith('Sem categoria')));n.style.gridTemplateColumns='minmax(0,1fr) auto';n.children[1].remove();text(n.lastElementChild,brl(s.residuo));body.append(n);}
    if(categorias.length){const t=clone(desktop.lastElementChild);t.style.gridTemplateColumns='minmax(0,1fr) auto';text(t.firstElementChild.firstElementChild,'= Total do mês'+(s.liquido?' (líquido)':''));text(t.firstElementChild.lastElementChild,brl(s.totalFixo)+' fixos · '+brl(s.decisoes)+' decisões do mês'+(s.creditos<0?' · '+brl(s.creditos)+' a receber':''));text(t.lastElementChild,brl(s.total));body.append(t);}
  }
  else{
    const section=root.querySelector('section[aria-label="Gastos por categoria"]');const original=[...section.children];const residuo=original.find(n=>n.textContent.trim().startsWith('Sem categoria'));const total=original.at(-1);section.replaceChildren(...categorias.map(linha));
    if(Math.abs(s.residuo)>.5){const n=clone(residuo);text(n.lastElementChild,brl(s.residuo));section.append(n);}
    const t=clone(total);text(t.firstElementChild.firstElementChild,'= Total do mês'+(s.liquido?' (líquido)':''));text(t.firstElementChild.lastElementChild,brl(s.totalFixo)+' fixos · '+brl(s.decisoes)+' decisões do mês'+(s.creditos<0?' · '+brl(s.creditos)+' a receber':''));text(t.lastElementChild,brl(s.total));section.append(t);
    const aside=root.querySelector('aside');if(atual)detalhe(aside,atual);else aside.remove();
  }
  // Notas emitidas pelo motor são texto, nunca HTML proveniente da API.
  let mensagens=(s.avisosTexto||[]).map(t=>t.startsWith('Mês parcial:')?t.replace('Mês parcial:','Cobertura parcial.').replace('ainda não foi conferida contra a base. O total real é maior. Não compare com um mês fechado.','ainda está incompleta nesta base. Os números deste mês podem mudar; evite comparar com um mês completo.'):t);
  mensagens=mensagens.map(t=>t.startsWith('Mês parcial com previsões:')||t.startsWith('Mês previsto:')?'Inclui previsões. Compromissos fixos e o restante previsto das faturas abertas aparecem como previsão até os lançamentos chegarem à base.':t);
  if(!mob){const main=root.querySelector('main');const alerts=[...main.children].filter(n=>n.style.border.includes('1px solid')&&n.style.fontSize==='14px');const anchor=main.lastElementChild;alerts.forEach(n=>n.remove());for(const msg of mensagens){const n=clone(alerts[msg.startsWith('Inclui previsões.')?0:1]);const target=n.lastElementChild;const pos=msg.startsWith('Só o cartão')||msg.startsWith('Reembolso esperado')?msg.indexOf(':'):msg.indexOf('.');if(pos>=0){const b=document.createElement('b');text(b,msg.slice(0,pos+1));target.replaceChildren(b,document.createTextNode(msg.slice(pos+1)));}else text(target,msg);main.insertBefore(n,anchor);}}
  if(mob){const a=root.children[1].children[2];if(mensagens.length){const coverage=mensagens.find(t=>t.startsWith('Cobertura parcial.'));const b=document.createElement('b');text(b,coverage?'Cobertura parcial':'Inclui previsões.');a.replaceChildren(b,document.createTextNode(coverage?' · '+coverage.replace(/^Cobertura parcial\. A /,'').replace('ainda está incompleta','incompleta').replace('Os números deste mês podem mudar; evite comparar com um mês completo.','os números podem mudar.'):''));if(coverage&&mensagens.some(t=>t.startsWith('Inclui previsões.'))){const b2=document.createElement('b');text(b2,' Inclui previsões.');a.append(b2);}}else a.remove();
    for(const msg of mensagens.filter(t=>!t.startsWith('Cobertura parcial.')&&!t.startsWith('Inclui previsões.'))){const states=parse(fontes.D002_Estados);const section=[...states.querySelectorAll('section')].find(n=>n.firstElementChild.textContent.includes(msg.startsWith('Só o cartão')?'Recorte por cartão':'Reembolso esperado'));const alert=clone(section.querySelector('div'));text(alert,msg);root.children[1].insertBefore(alert,root.children[1].querySelector('[data-categoria]'));}
  }
  if(!categorias.length){const states=parse(fontes.D002_Estados);const sec=[...states.querySelectorAll('section')].find(n=>n.firstElementChild.textContent.includes('Mês sem lançamentos'));const vazio=clone(sec.querySelector('div'));vazio.lastElementChild.remove();text(vazio.firstElementChild,'Nenhuma transação em '+mes+' de '+s.mes.y);const target=mob?root.children[1]:root.querySelector('section[aria-label="Gastos por categoria"]');if(mob)target.append(vazio);else target.replaceChildren(vazio);}
  if(s.perfil==='Julia'){for(const n of root.querySelectorAll('*')){if(n.style.backgroundColor==='rgb(200, 240, 74)'){n.style.backgroundColor=n.closest('nav')&&mob?'#2FB79B':'#8EE6D3';if(n.closest('nav')&&mob)n.style.boxShadow='none';}}const conta=root.querySelector('header button[aria-haspopup]')||(mob?root.querySelector('header')?.lastElementChild:null);if(conta){const ref=parse(fontes.D016_Julia_Celular).querySelector('header button');conta.replaceWith(clone(ref));}}
  return root;
}
