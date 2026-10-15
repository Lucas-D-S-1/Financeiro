import {geometriaGrafico} from './grafico-geometria.mjs';
export function graficoView(fontes,modelo,com,mob,apresentacao={},acoes={}){
 const doc=new DOMParser().parseFromString(fontes.D015_Grafico,'text/html'),sec=doc.querySelector('[aria-label="Gráfico no '+(mob?'celular':'computador')+'"]'),g=geometriaGrafico(modelo,com,apresentacao,mob);
 const plot=document.importNode(sec.children[2],true),ticks=document.importNode(sec.children[3],true),svg=plot.querySelector('svg');
 for(const n of plot.querySelectorAll('sc-for'))n.remove();
 const paths=svg.querySelectorAll('path');[g.zero,g.hoje,g.outro,g.real,g.ativo].forEach((d,i)=>paths[i].setAttribute('d',d));svg.setAttribute('aria-label',g.aria);
 for(const [i,p]of g.pontos.entries()){const n=document.createElement('span');n.setAttribute('aria-hidden','true');n.style.cssText=p.style;n.dataset.marca=String(i);plot.append(n);}
 for(const [i,r]of g.rotulos.entries()){const n=document.createElement('span');n.style.cssText=r.style;n.textContent=r.txt;if(acoes.minimo&&i===(g.minimo.data===[...modelo.dias.keys()][0]?0:1)){n.setAttribute('role','button');n.tabIndex=0;n.onclick=()=>acoes.minimo(g.minimo.data);n.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();n.onclick();}};}plot.append(n);}
 ticks.replaceChildren();for(const t of g.ticks){const n=document.createElement('span');n.style.cssText=t.style;n.textContent=t.txt;ticks.append(n);}
 const legend=document.importNode(sec.children[1],true);for(const n of legend.querySelectorAll('sc-if')){if(g.temReal)n.replaceWith(...n.childNodes);else n.remove();}for(const n of legend.querySelectorAll('span'))for(const t of [...n.childNodes])if(t.nodeType===3&&/\{\{/.test(t.textContent)){const partes=t.textContent.split(/(\{\{ (?:ativoRot|outroRot) \}\})/);const nodes=partes.map(s=>{if(s.startsWith('{{')){const value=document.createElement('span');value.className='sc-interp';value.textContent=s.includes('ativoRot')?(com?'com acerto':'sem acerto'):(com?'sem acerto':'com acerto');return value;}return document.createTextNode(s);});t.replaceWith(...nodes);}
 return {plot,ticks,legend,geometria:g};
}
