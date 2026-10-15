// Templates locais confiáveis extraídos de Main; nenhum HTML vindo do ledger.
const resolver = (scope, path) => path.trim().split('.').reduce((o, k) => o?.[k], scope);
const completo = /^\s*{{\s*([^}]+)\s*}}\s*$/;
export function montarTemplate(template, valores) {
  function montar(node, scope) {
    if (node.nodeType === Node.TEXT_NODE) {
      // O runtime aprovado envolve interpolações em spans. Em pais flex, esse
      // span participa do gap e muda a composição; preservamos a mesma árvore.
      const frag = document.createDocumentFragment();
      const re = /{{\s*([^}]+)\s*}}/g;
      let anterior = 0, match;
      while ((match = re.exec(node.textContent))) {
        frag.append(document.createTextNode(node.textContent.slice(anterior, match.index)));
        // ! indica texto originalmente literal que recebeu dados de período;
        // conserva sua estrutura original sem criar um span adicional.
        const literal = match[1].trim().startsWith('!');
        const valor = resolver(scope, literal ? match[1].trim().slice(1) : match[1]) ?? '';
        if (literal) frag.append(document.createTextNode(valor));
        else { const span = document.createElement('span'); span.className = 'sc-interp'; span.textContent = valor; frag.append(span); }
        anterior = re.lastIndex;
      }
      frag.append(document.createTextNode(node.textContent.slice(anterior)));
      frag.normalize();
      return frag;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return node.cloneNode();
    if (node.localName === 'sc-if') {
      const frag = document.createDocumentFragment();
      const path = completo.exec(node.getAttribute('value'))?.[1];
      if (resolver(scope, path || '')) for (const c of node.childNodes) frag.append(montar(c, scope));
      return frag;
    }
    if (node.localName === 'sc-for' || (node.localName === 'template' && node.hasAttribute('data-list'))) {
      const nativo = node.localName === 'template';
      const frag = document.createDocumentFragment(), path = completo.exec(node.getAttribute(nativo ? 'data-list' : 'list'))?.[1];
      for (const item of resolver(scope, path || '') || []) {
        const child = { ...scope, [node.getAttribute(nativo ? 'data-as' : 'as')]: item };
        for (const c of nativo ? node.content.childNodes : node.childNodes) frag.append(montar(c, child));
      }
      return frag;
    }
    const el = document.createElementNS(node.namespaceURI, node.localName);
    for (const attr of node.attributes) {
      if (/^on/i.test(attr.name)) {
        const fn = resolver(scope, completo.exec(attr.value)?.[1] || '');
        if (typeof fn === 'function') el.addEventListener(attr.name.slice(2).toLowerCase(), fn);
        else if (['onclick', 'onchange', 'oninput', 'onsubmit'].includes(attr.name.toLowerCase())) {
          el.setAttribute('disabled', '');
          el.setAttribute('title', 'Indisponível nesta fatia de implementação');
        }
      } else if (!attr.name.startsWith('hint-')) {
        if (['disabled', 'checked', 'selected'].includes(attr.name) && completo.test(attr.value)) {
          const enabled = resolver(scope, completo.exec(attr.value)[1]);
          if (enabled) el.setAttribute(attr.name, '');
          continue;
        }
        const v = attr.value.replace(/{{\s*([^}]+)\s*}}/g, (_, p) => resolver(scope, p) ?? '');
        el.setAttribute(attr.name, v);
      }
    }
    for (const c of node.childNodes) el.append(montar(c, scope));
    return el;
  }
  const resultado = document.createDocumentFragment();
  for (const node of template.content.childNodes) resultado.append(montar(node, valores));
  return resultado;
}
