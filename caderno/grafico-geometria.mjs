// Geometria/estilos oficiais D015, sem cálculo financeiro: mínimo obrigatório do payload.
const dm=k=>k.slice(8,10)+'/'+k.slice(5,7);
const brl=v=>(v<0?'−':'')+'R$ '+Math.abs(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
export function geometriaGrafico(modelo, com=false, apresentacao={}, mob=false) {
    const H=mob?180:260,pad=mob?12:16,gap=mob?16:7;
    const C={dias:[...modelo.dias.values()].map(d=>[d.data,d.saldo.sem,d.saldo.com]),abertura:modelo.fonte.abertura===true,real:apresentacao.realizadoAte||null,minimo:{sem:modelo.minimo("sem"),com:modelo.minimo("com")}};
    const dias = C.dias, n = dias.length, ia = com ? 2 : 1, io = com ? 1 : 2;
    const vals = [0]; for (const d of dias) { vals.push(d[1], d[2]); }
    let min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (max === min) { min -= 1; max += 1; }
    const x = i => n === 1 ? 500 : i / (n - 1) * 1000;
    const y = v => pad + (1 - (v - min) / (max - min)) * (H - 2 * pad);
    const serie = (k, de, ate) => n < 2 || ate <= de ? '' : dias.slice(de, ate + 1).map((d, j) => (j ? 'L' : 'M') + x(de + j).toFixed(1) + ' ' + y(d[k]).toFixed(1)).join(' ');
    let iReal = C.real ? dias.findIndex(d => d[0] === C.real) : -1; if (iReal < 1) iReal = -1;
    const ini = Math.max(0, iReal);
    const minimo = C.minimo[com ? 'com' : 'sem'];
    const iMin = dias.findIndex(d => d[0] === minimo.data);
    const pct = v => (v).toFixed(2) + '%';
    const pontos = [], rotulos = [];
    const neg = minimo.v < 0, corMin = neg ? '#B3261E' : '#16171A';
    const nomeMin = neg ? 'mínimo' : 'menor saldo', nomeIni = C.abertura ? 'abertura' : 'início';
    const fs = mob ? 11 : 12;
    const rot = (xp, yp, txt, cor, abaixo) => {
      const tx = xp < 10 ? '0%' : xp > 90 ? '-100%' : '-50%';
      const ty = abaixo ? '45%' : '-145%';
      return { style: 'position: absolute; left: ' + pct(xp) + '; top: ' + pct(yp) + '; transform: translate(' + tx + ', ' + ty + '); font-size: ' + fs + 'px; font-weight: 600; color: ' + cor + '; background: #FFFFFF; padding: 2px 6px; border-radius: 6px; white-space: nowrap', txt };
    };
    const dot = (xp, yp, cor, tam, oco) => ({ style: 'position: absolute; left: ' + pct(xp) + '; top: ' + pct(yp) + '; width: ' + tam + 'px; height: ' + tam + 'px; margin: -' + tam / 2 + 'px 0 0 -' + tam / 2 + 'px; border-radius: 50%; box-sizing: border-box; background: ' + (oco ? '#FFFFFF' : cor) + '; border: ' + (oco ? '2px solid ' + cor : '0') + '; box-shadow: 0 0 0 3px #FFFFFF' });
    const xs = x(0) / 10, ys = y(dias[0][ia]) / H * 100;
    if (n === 1) pontos.push(dot(50, y(dias[0][io]) / H * 100, '#8E8B83', 12, true));
    if (iMin === 0) {
      pontos.push(dot(xs, ys, corMin, 14));
      rotulos.push(rot(xs, ys, nomeIni + ' e ' + nomeMin + ' ' + dm(dias[0][0]) + (mob ? '' : ' · ' + brl(dias[0][ia])), corMin, ys < 25));
    } else {
      const xm = x(iMin) / 10, ym = y(minimo.v) / H * 100;
      const abIni = ys < 25, perto = Math.abs(xm - xs) < 15 && Math.abs(ym - ys) < 15;
      pontos.push(dot(xs, ys, '#16171A', 12));
      rotulos.push(rot(xs, ys, nomeIni + ' ' + dm(dias[0][0]) + (mob ? '' : ' · ' + brl(dias[0][ia])), '#16171A', abIni));
      pontos.push(dot(xm, ym, corMin, 14));
      rotulos.push(rot(xm, ym, nomeMin + ' ' + dm(minimo.data), corMin, perto ? !abIni : ym < 25));
    }
    if (iReal > 0) rotulos.push({ style: 'position: absolute; left: ' + pct(x(iReal) / 10) + '; top: 0; transform: translate(4px, -2px); font-size: ' + (fs - 1) + 'px; color: #4A4D55; white-space: nowrap', txt: 'hoje ' + dm(dias[iReal][0]) });
    const ticks = [];
    const tk = (p, txt, al) => ({ p, x:pct(p), style: 'position: absolute; ' + (al === 'r' ? 'right: 0' : 'left: ' + pct(p)) + '; transform: translateX(' + (al === 'c' ? '-50%' : '0') + '); white-space: nowrap', txt });
    if (n === 1) ticks.push(tk(50, dm(dias[0][0]), 'c'));
    else {
      ticks.push(tk(0, dm(dias[0][0]), 'l'));
      let ult = 0;
      dias.forEach((d, i) => { if (i > 0 && d[0].slice(8) === '01') { const p = x(i) / 10; if (p - ult >= gap && 100 - p >= gap) { ticks.push(tk(p, '1º/' + d[0].slice(5, 7), 'c')); ult = p; } } });
      ticks.push(tk(100, dm(dias[n - 1][0]), 'r'));
    }
    return { zero: 'M0 ' + y(0).toFixed(1) + ' L1000 ' + y(0).toFixed(1), hoje: iReal > 0 ? 'M' + x(iReal).toFixed(1) + ' 0 L' + x(iReal).toFixed(1) + ' ' + H : '',
      real: iReal > 0 ? serie(ia, 0, iReal) : '', ativo: serie(ia, ini, n - 1), outro: serie(io, ini, n - 1), pontos, rotulos, ticks, min, max, minimo, H, pad, temReal:iReal>0, n, aria:'Saldo previsto de '+dm(dias[0][0])+' a '+dm(dias[n-1][0])+', '+(com?'com acerto':'sem acerto')+'. '+(neg?'Mínimo ':'Menor saldo ')+brl(minimo.v)+' em '+dm(minimo.data)+'.' };
  }
