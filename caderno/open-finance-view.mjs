// D-027 (L-006): faixa "Open Finance" no Hoje — computador (`L006_Main`) e
// cartão no celular (`D027_Celular_1`/`_2`). Clona a prancha e aplica as
// regras de texto e estilo da resposta do designer; nada de desenho novo.
//
// modelo = {
//   ultima:   último resultado gravado (leitura do painel, `open_finance.ultima`),
//   resposta: resposta do POST desta sessão (ou null),
//   estado:   'repouso' | 'sincronizando' | 'erro',
//   demorando: true depois de 60 s sincronizando,
//   erro:     texto do erro geral,
// }
const parse = s => new DOMParser().parseFromString(s, 'text/html').querySelector('x-dc > div');
const clone = n => document.importNode(n, true);
const dois = n => String(n).padStart(2, '0');
const hora = d => dois(d.getHours()) + ':' + dois(d.getMinutes());
const ddmm = d => dois(d.getDate()) + '/' + dois(d.getMonth() + 1);
const data = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d : null; };
function quando(d, agora = new Date()) {
  const ontem = new Date(agora); ontem.setDate(agora.getDate() - 1);
  const mesmo = (a, b) => a.toDateString() === b.toDateString();
  return (mesmo(d, agora) ? 'hoje' : mesmo(d, ontem) ? 'ontem' : ddmm(d)) + ', ' + hora(d);
}
const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);

const ESTILO_RES = {
  ok: 'background: #F4F3EF; border: 1px solid #F4F3EF',
  aviso: 'background: #FFF1D6; border: 1px solid #E8C98A; color: #4A3A1A',
  erro: 'background: #FBE3E0; border: 1px solid #E3B4AE; color: #5A1712',
};
const ESTILO_RES_CEL = {
  ok: 'background: #F4F3EF',
  aviso: 'background: #FFF1D6; border: 1px solid #E8C98A; color: #4A3A1A',
  erro: 'background: #FBE3E0; border: 1px solid #E3B4AE; color: #5A1712',
};

// Resumo do estado 3/4: partes com zero somem; "já estavam no caderno" junta o
// que casou com o histórico agora e o que já estava ligado de antes.
export function resumoSincronizacao(r) {
  if(r.modo==='coleta' || r.financeiro_bloqueado) return {novo:false,texto:'Dados coletados. A conciliação financeira tem pendências para revisão e aprovação.'};
  const novos = Number(r.novos) || 0, ajust = Number(r.ajustados) || 0, saldos = Number(r.saldos) || 0;
  const ja = (Number(r.casados) || 0) + (Number(r.ja_lancados) || 0);
  const partesSaldo = saldos ? [plural(saldos, 'saldo atualizado', 'saldos atualizados')] : [];
  if (novos + ajust === 0) {
    const nada = ja ? 'Nada novo: ' + (ja === 1 ? 'o lançamento que veio já estava no caderno.' : 'os ' + ja + ' lançamentos que vieram já estavam no caderno.')
      : 'Nada novo: o Open Finance não trouxe lançamentos.';
    return { novo: false, texto: [nada, ...partesSaldo.map(p => p.charAt(0).toUpperCase() + p.slice(1) + '.')].join(' ') };
  }
  const partes = [novos && plural(novos, 'novo', 'novos'), ajust && plural(ajust, 'ajustado', 'ajustados'), ...partesSaldo,
    ja && ja + ' já estavam no caderno'].filter(Boolean);
  return { novo: true, texto: partes.join(' · ') + '. A tela foi relida.', curto: partes.filter(p => !/já estavam/.test(p)).join(' · ') };
}

// Frases por conexão: pedido, conclusão e leitura local são eventos distintos.
export function diagnosticoConexao(c) {
  if (c.status === 'reconectar') return 'Precisa reconectar no meu.pluggy.ai.';
  if (c.status === 'em_curso' || c.atualizacao === 'em_curso') return c.forcada
    ? 'Pedido aceito; atualização do banco ainda em curso. Lidos os dados disponíveis.'
    : 'Atualização do banco em curso. Lidos os dados disponíveis.';
  if (c.status === 'parcial') return 'Atualização parcial; alguns produtos podem estar desatualizados.';
  // A1: recusa do pedido e falha da conexão são informações independentes.
  const falhaAnterior = c.status === 'erro' ? 'Falha na conexão. ' : '';
  const leitura = c.status === 'erro' ? ' Confira a data do banco.' : ' Lidos os dados disponíveis.';
  if (c.atualizacao === 'limite_frequencia') {
    const ate = data(c.tentar_apos);
    return falhaAnterior + 'Limite de frequência.' + leitura +
      (ate ? ' Nova tentativa permitida a partir de ' + ddmm(ate) + ' ' + hora(ate) + '.' : ' O serviço não informou quando tentar novamente.');
  }
  if (c.atualizacao === 'manual_indisponivel') return falhaAnterior + 'Atualização manual indisponível.' + leitura + ' Esperar uma hora não libera o pedido.';
  if (c.status === 'erro') return 'Falha na atualização. Confira a data do banco; a leitura pode conter dados anteriores.';
  if (c.atualizacao === 'proxy_cache') return 'Lidos os dados disponíveis no Meu Pluggy. A atualização do banco é automática.';
  if (c.atualizacao === 'erro') return 'Falha na atualização. Confira a data do banco; a leitura pode conter dados anteriores.';
  if (c.forcada && c.atualizacao === 'concluida') return 'Pedido aceito e atualização concluída pelo banco.';
  return 'Lidos os dados disponíveis. Confira a data do banco.';
}

function conexoesDe(modelo) {
  const fonte = modelo.resposta?.conexoes || modelo.ultima?.resultado?.conexoes;
  return fonte?.length ? fonte : [{ banco: 'Santander' }, { banco: 'Itaú' }];
}

export function faixaOpenFinance(fontes, modelo, mob, acoes = {}) {
  const r = modelo.resposta, ultima = modelo.ultima, agora = new Date();
  const executado = data(r?.executado_em || ultima?.resultado?.executado_em || ultima?.concluida_em);
  const conns = conexoesDe(modelo);
  const sinc = modelo.estado === 'sincronizando', erroGeral = modelo.estado === 'erro';

  // ── Linha de status (role=status, sempre presente) ────────────────────────
  let linha;
  if (sinc) linha = modelo.demorando ? 'A leitura continua. A atualização dos bancos pode demorar mais.'
    : mob ? 'Lendo o Open Finance. Os números mudam ao concluir a leitura.'
      : 'Lendo o Open Finance. Os números abaixo continuam os de antes até a leitura terminar.';
  else if (executado) linha = mob ? 'Última leitura local ' + quando(executado, agora) + ' · roda 1 vez por dia'
    : 'Última leitura local: ' + quando(executado, agora) + '. Roda sozinha uma vez por dia.';
  else linha = 'Ainda não houve leitura local. A rotina roda uma vez por dia.';

  // U01: a coleta OFF gravou fila/manifesto no banco. O GET inicial entrega
  // esse resultado em ultima, inclusive após reload e execução diária.
  // Sucessos antigos não viram mensagem transitória novamente; uma resposta
  // nova desta sessão tem precedência sobre a execução persistida anterior.
  const persistido = ultima?.resultado;
  const pendente = v => v?.modo === 'coleta' || v?.financeiro_bloqueado === true;
  const resultado = r || (pendente(persistido) ? persistido : null);

  // ── Resultado da sessão ou aviso persistido de pendência ────────────────
  let res = null;
  if (erroGeral) res = { tipo: 'erro', titulo: 'Não deu para sincronizar.', texto: 'O Open Finance respondeu: “' + (modelo.erro || 'sem conexão') + '”. Releia a base para conferir o resultado.' };
  else if (resultado && !sinc) {
    const h = hora(data(resultado.executado_em) || executado || agora), s = resumoSincronizacao(resultado);
    const aviso = pendente(resultado) || conns.some(c => c.status !== 'ok' ||
      ['proxy_cache', 'limite_frequencia', 'manual_indisponivel', 'em_curso', 'erro'].includes(c.atualizacao));
    res = { tipo: aviso ? 'aviso' : 'ok', titulo: r ? 'Leitura local concluída às ' + h + '.' : 'Conciliação financeira pendente.',
      texto: s.texto, link: s.novo };
  }

  const textoConexao = (c, prefixo) => {
    const d = data(c.banco_atualizado_em);
    return (d ? prefixo + ddmm(d) + ' ' + hora(d) : 'data do banco indisponível') + ' · ' + diagnosticoConexao(c);
  };

  if (!mob) {
    // ── Computador: faixa da `Main` ─────────────────────────────────────────
    const sec = clone(parse(fontes.L006_Main).querySelector('section[aria-label="Open Finance"]'));
    sec.querySelector('[role=status]').textContent = linha;
    const ul = sec.querySelector('ul'), modeloLi = ul.querySelector('li');
    ul.replaceChildren(...conns.map(c => {
      const ruim = c.status === 'reconectar' || c.status === 'erro';
      const li = clone(modeloLi);
      li.style.cssText = 'min-width: 200px; box-sizing: border-box; padding: 8px 12px; border-radius: 10px; display: flex; flex-direction: column; gap: 2px; ' +
        (ruim ? 'background: #FBE3E0; border: 1px solid #E3B4AE' : 'background: #FFFFFF; border: 1px solid #DDDAD2');
      const [nome, sub] = li.querySelectorAll(':scope > span');
      nome.textContent = c.banco + (c.status === 'reconectar' ? ' · precisa reconectar' : c.status === 'erro' ? ' · não respondeu' : '');
      nome.style.cssText = 'font-size: 14px; font-weight: 600' + (ruim ? '; color: #5A1712' : '');
      sub.textContent = textoConexao(c, 'dados do banco em ');
      sub.style.cssText = 'font-size: 12px; color: ' + (ruim ? '#5A1712' : '#4A4D55');
      const link = li.querySelector('sc-if');
      if (c.status === 'reconectar') link.replaceWith(...link.childNodes); else link.remove();
      return li;
    }));
    const [livre, ocupado, tentar] = [...sec.querySelector('div').querySelectorAll(':scope > sc-if')];
    const escolha = erroGeral ? tentar : sinc ? ocupado : livre;
    for (const b of [livre, ocupado, tentar]) if (b !== escolha) b.remove();
    escolha.replaceWith(...escolha.childNodes);
    const blocos = [...sec.querySelectorAll(':scope > sc-if')];
    const [caixa, barra] = blocos;
    if (res) {
      const div = caixa.querySelector('div');
      div.setAttribute('role', res.tipo === 'erro' ? 'alert' : 'status');
      div.style.cssText = 'padding: 10px 14px; border-radius: 10px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 6px 16px; font-size: 14px; line-height: 1.45; ' + ESTILO_RES[res.tipo];
      const [b, resto] = [div.querySelector('b'), div.querySelector('b').nextSibling];
      b.textContent = res.titulo; resto.textContent = ' ' + res.texto;
      const lk = div.querySelector('sc-if');
      if (res.link) { lk.replaceWith(...lk.childNodes); const a = div.querySelector('a'); a.href = './extrato.html'; a.style.color = 'inherit'; } else lk.remove();
      caixa.replaceWith(...caixa.childNodes);
    } else caixa.remove();
    if (sinc) barra.replaceWith(...barra.childNodes); else barra.remove();
    sec.querySelector('button').onclick = acoes.sincronizar;
    return sec;
  }

  // ── Celular: cartão do D027_Celular_1 ───────────────────────────────────────
  const sec = clone(parse(fontes.D027_Celular_1).querySelector('section[aria-label="Open Finance"]'));
  sec.querySelector('[role=status]').textContent = linha;
  const ul = sec.querySelector('ul'), [li1, li2] = ul.querySelectorAll('li');
  ul.replaceChildren(...conns.map((c, i) => {
    const ruim = c.status === 'reconectar' || c.status === 'erro';
    const li = clone(i ? li2 : li1);
    const [nome, sub] = li.querySelectorAll('span');
    nome.textContent = c.banco + (c.status === 'reconectar' ? ' · precisa reconectar' : c.status === 'erro' ? ' · não respondeu' : '');
    sub.textContent = textoConexao(c, 'dados do banco em ');
    nome.style.flex = '0 1 auto'; sub.style.flex = '0 1 auto';
    nome.style.width = '100%'; sub.style.width = '100%';
    if (ruim) {
      li.style.cssText = 'display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 10px; padding: 8px 10px; background: #FBE3E0; border: 1px solid #E3B4AE; border-radius: 8px; color: #5A1712' + (i ? '; margin-top: 6px' : '');
      sub.style.color = '#5A1712';
      if (c.status === 'reconectar') {
        const a = document.createElement('a');
        a.href = 'https://meu.pluggy.ai'; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.cssText = 'font-weight: 600; color: #5A1712';
        a.innerHTML = 'Reconectar no meu.pluggy.ai<span aria-hidden="true"> ↗</span><span style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap"> (abre em nova aba)</span>';
        li.append(a);
      }
    }
    li.style.flexDirection = 'column'; li.style.alignItems = 'flex-start';
    return li;
  }));
  const botao = sec.querySelector('button');
  if (res) {
    const div = document.createElement('div');
    div.setAttribute('role', res.tipo === 'erro' ? 'alert' : 'status');
    div.style.cssText = 'padding: 10px 12px; border-radius: 10px; font-size: 14px; line-height: 1.45; ' + ESTILO_RES_CEL[res.tipo];
    const b = document.createElement('b'); b.style.fontWeight = '600'; b.textContent = res.titulo;
    div.append(b, ' ' + res.texto);
    if (res.link) { const a = document.createElement('a'); a.href = './extrato.html'; a.style.cssText = 'font-size: 14px; white-space: nowrap; color: inherit'; a.textContent = 'ver no extrato'; div.append(' ', a); }
    sec.insertBefore(div, botao);
  }
  if (sinc) {
    botao.textContent = 'Sincronizando…'; botao.disabled = true; botao.setAttribute('aria-busy', 'true');
    botao.style.cssText += '; background: #ECEAE4; color: #5D6068; border-color: #DDDAD2; cursor: not-allowed';
    const barra = clone(parse(fontes.L006_Main).querySelector('.of-barra').parentElement);
    sec.append(barra);
  } else if (erroGeral) {
    botao.textContent = 'Tentar de novo';
    botao.style.cssText = 'min-height: 44px; background: #16171A; color: #FFFFFF; border: 0; border-radius: 10px; font-size: 14px; font-weight: 600';
  }
  botao.onclick = acoes.sincronizar;
  for (const n of sec.children) n.style.flexShrink = '0';
  return sec;
}

// Sinal persistente do Atenção (estado 6): enquanto a última sincronização
// gravada disser "reconectar".
export function sinaisOpenFinance(modelo) {
  return conexoesDe(modelo).filter(c => c.status === 'reconectar').map(c => {
    const d = data(c.banco_atualizado_em);
    return { tipo: 'cobertura', curto: c.banco + ' precisa reconectar', titulo: c.banco + ' precisa reconectar:',
      texto: ' os dados do ' + c.banco + ' param em ' + (d ? ddmm(d) + ' ' + hora(d) : 'data desconhecida') + '. Reconecte no meu.pluggy.ai.' };
  });
}

// Linha âmbar da projeção (estado 3): a sincronização trouxe algo que a
// análise diária ainda não inclui.
export function avisoProjecao(modelo, dataBaseAnalise) {
  const r = modelo.resposta || modelo.ultima?.resultado;
  if (!r || (Number(r.novos) || 0) + (Number(r.ajustados) || 0) === 0) return null;
  const quando = data(r.executado_em);
  if (!quando) return null;
  if (dataBaseAnalise && new Date(dataBaseAnalise + 'T23:59:59') >= quando) return null;
  return 'Pode não incluir o que a sincronização das ' + hora(quando) + ' trouxe.';
}
