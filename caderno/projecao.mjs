import {geometriaGrafico} from './grafico-geometria.mjs';
// Adaptação de leitura do contrato existente caixa_diario_v1.
// Os valores de saldo e as mínimas vêm da análise, nunca de um modelo do canvas.
const numero = x => typeof x === 'number' && Number.isFinite(x);
const par = x => x && numero(x.sem) && numero(x.com);
const iso = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  !Number.isNaN(Date.parse(x + 'T12:00:00Z')) && new Date(x + 'T12:00:00Z').toISOString().slice(0, 10) === x;
export function lerProjecao(envelope, perfil) {
  if (!envelope || envelope.perfil !== perfil || !['Lucas', 'Julia'].includes(perfil)) throw new Error('Escopo da projeção inválido');
  if (envelope.disponivel !== true) return null;
  const p = envelope.dados?.cash_projection;
  if (!p || p.schema !== 'caixa_diario_v1' || !Array.isArray(p.months) || !p.months.length || !iso(p.data_base)) throw new Error('Formato de projeção inválido');
  const dias = new Map(), meses = [];
  let anterior = '';
  for (const m of p.months) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.key) || m.key <= anterior || !par(m.abre) || !par(m.fim) || !m.days?.length) throw new Error('Mês de projeção inválido');
    let diaAnterior = null;
    for (const d of m.days) {
      if (!iso(d.data) || !d.data.startsWith(m.key + '-') || d.d !== Number(d.data.slice(8)) || !par(d.saldo) || !Array.isArray(d.ev) ||
          (diaAnterior && Date.parse(d.data) - Date.parse(diaAnterior) !== 86400000)) throw new Error('Dia da projeção inválido');
      if (d.ev.some(e => !numero(e.valor) || typeof e.desc !== 'string' || typeof e.meio !== 'string')) throw new Error('Evento da projeção inválido');
      dias.set(d.data, d); diaAnterior = d.data;
    }
    for (const c of ['sem', 'com']) {
      const min = m.minimo?.[c];
      if (!min || !numero(min.v) || !iso(min.data) || !dias.has(min.data) || min.data.slice(0, 7) !== m.key || dias.get(min.data).saldo[c] !== min.v) throw new Error('Mínimo da projeção inválido');
      if (m.fim[c] !== m.days.at(-1).saldo[c]) throw new Error('Fechamento da projeção divergente');
    }
    meses.push(m); anterior = m.key;
  }
  const minimo = c => meses.reduce((atual, m) => m.minimo[c].v < atual.v ? m.minimo[c] : atual, meses[0].minimo[c]);
  return {
    perfil, fonte: p, meses, dias, minimo,
    noDia: (data, com = false) => {
      const d = dias.get(data);
      if (!d) return null; // ausência de dado não é saldo zero
      return { data, saldo: d.saldo[com ? 'com' : 'sem'], eventos: d.ev,
        entrada: com ? Math.round(((d.entrada || 0) + (d.acerto || 0)) * 100) / 100 : d.entrada || 0,
        saida: d.saida || 0, acerto: d.acerto || 0 };
    },
    em30: meses.map(m => ({ data: m.key + '-30', dia: dias.get(m.key + '-30') || null })),
    avisos: p.avisos || [], pendencias: p.pendencias || [], semData: p.sem_data || []
  };
}
// Geometria do gráfico aprovado: transformações de coordenadas, sem alterar saldos.
export function graficoDaProjecao(modelo,com=false,realizadoAte=null,mob=false){
 const g=geometriaGrafico(modelo,com,{realizadoAte},mob),dias=[...modelo.dias.values()],i=dias.findIndex(d=>d.data===g.minimo.data),x=dias.length===1?50:i/(dias.length-1)*100;
 return {...g,hojeLinha:g.hoje,minX:x.toFixed(2)+'%',minY:(g.pad+(1-(g.minimo.v-g.min)/(g.max-g.min))*(g.H-2*g.pad))/g.H*100+'%'};
}
export function coberturaCalendarioCompleta(modelo) {
  return modelo.meses.every(m => m.days[0].d === 1 && m.days.length === new Date(Date.UTC(Number(m.key.slice(0, 4)), Number(m.key.slice(5)), 0)).getUTCDate());
}
