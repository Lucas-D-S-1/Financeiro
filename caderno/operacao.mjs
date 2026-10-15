// Leitura de linhas já normalizadas pelo painel. Sem escrita, fila ou HTML de API.
const meses=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
export function mesInformado(s){if(typeof s!=='string'||! /^(0[1-9]|1[0-2])\/\d{4}$/.test(s))return null;return meses[Number(s.slice(0,2))-1]+' de '+s.slice(3);}
export function lerOperacao(envelope,id,pessoa){
 if(envelope?.escopo!=='pessoa'||envelope.perfil!==pessoa)throw new Error('Escopo individual obrigatório');
 const r=envelope.movimentacoes?.find(r=>r.id===id&&r.person===pessoa);
 const tx=envelope.transacoes?.find(r=>r.id===id&&r.person===pessoa);
 if(!r||r.projetado||r.produto==='sintetico'||tx?.projetado||tx?.produto==='sintetico')return null;
 if(!['Débito','Crédito'].includes(r.direcao))throw new Error('Direção desconhecida');
 const credito=r.direcao==='Crédito',v=credito?r.credito:r.debito;
 if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw new Error('Valor informado inválido');
 const ov=envelope.correcao?.[id];const metodo=String(r.origem||'').split('·')[0];
 const origem=new Map([['pdf_fatura_local','PDF da fatura'],['captura_fatura_parcial','Captura parcial do app']]).get(metodo)||'não informada';
 const cat=r.rotuloCategoria||r.cat;const original=r.descOriginal&&r.descOriginal!==r.desc?r.descOriginal:null;
 return {id,pessoa,nome:r.desc,original,valor:credito?v:-v,direcao:credito?'entrada · crédito':'saída · débito',data:r.data,categoria:cat,
 tipo:r.tipo+(tx?.parcTotal>1?' · '+tx.parcAtual+'/'+tx.parcTotal:''),banco:[r.banco,r.produto==='cartao'?'cartão':r.produto].filter(Boolean).join(' · '),
 caixa:mesInformado(tx?.mesCaixa||tx?.mes),competencia:mesInformado(r.mes),fatura:mesInformado(r.fatura),origem,
 correcao:ov?.person===pessoa?{de:ov.catOriginal,para:ov.catNova,data:ov.editadoEm}:null,edicaoDisponivel:false};
}
