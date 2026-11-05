// Estado e modelos de tags de tema e clima da página (design D-13). Puro, sem DOM.
// A lista de tags vem só de `meta.temas.lista` da base; nenhuma keyword do TMDB passa por aqui.

export const MIN_FILMES_POR_TAG = 20;
export const MAX_CHIPS = 10;
export const MAX_TAGS_CARD = 3;
export const MAX_TEMAS_CARD = 2;

const porRotulo = (a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR');
const valida = (t) => t && typeof t.id === 'string' && t.id !== '' && typeof t.rotulo === 'string' && t.rotulo !== ''
  && Number.isInteger(t.filmes) && t.filmes >= MIN_FILMES_POR_TAG;

// Itens válidos de meta.temas.lista, em ordem alfabética pt-BR do rótulo; [] sem meta.temas.
export function listaDeTags(meta) {
  const lista = meta?.temas?.lista;
  if (!Array.isArray(lista)) return [];
  return lista.filter(valida).map(({ id, rotulo, filmes }) => ({ id, rotulo, filmes })).sort(porRotulo);
}

// Estado: Map id -> 'incluida' | 'excluida' (neutra é ausência). Devolve sempre um novo Map.
export function alternar(estado, id, acao) {
  const alvo = acao === 'excluir' ? 'excluida' : 'incluida';
  const novo = new Map(estado);
  if (novo.get(id) === alvo) novo.delete(id);
  else novo.set(id, alvo);
  return novo;
}

export const estadoDaTag = (estado, id) => estado.get(id) ?? 'neutra';

export function filtroDoEstado(estado) {
  const ids = [...estado.keys()].sort();
  return {
    incluir: ids.filter((id) => estado.get(id) === 'incluida'),
    excluir: ids.filter((id) => estado.get(id) === 'excluida'),
  };
}

// Modelo dos 2 botões de uma tag (formulário e chips), FILMELIER-5 (D-6): o "+" inclui ("Quero {rótulo}") e o "−" exclui
// ("Não quero {rótulo}"). `icone` é decoração visual (a UI o põe em aria-hidden); `nome` é o nome acessível.
export const ICONE_INCLUIR = '+';
export const ICONE_EXCLUIR = '\u2212';

export function montarControle(tag, estado) {
  const e = estadoDaTag(estado, tag.id);
  return {
    id: tag.id,
    rotulo: tag.rotulo,
    botoes: [
      { acao: 'incluir', tag: tag.id, icone: ICONE_INCLUIR, nome: `Quero ${tag.rotulo}`, pressionado: e === 'incluida' },
      { acao: 'excluir', tag: tag.id, icone: ICONE_EXCLUIR, nome: `Não quero ${tag.rotulo}`, pressionado: e === 'excluida' },
    ],
  };
}

export const montarControles = (lista, estado) => lista.map((t) => montarControle(t, estado));

// Chips (D-13): primeiro as tags ativas (ordem pt-BR do rótulo, mesmo fora do conjunto ou com resultado vazio), depois as
// tags do conjunto candidato com no mínimo 20 filmes na lista da base, por frequência decrescente no conjunto e rótulo.
export function montarChips({ candidatos = [], estado = new Map(), lista = [] } = {}) {
  const daLista = new Map(lista.filter((t) => t && typeof t.id === 'string' && typeof t.rotulo === 'string').map((t) => [t.id, t]));
  const modelo = (t) => ({
    id: t.id, rotulo: t.rotulo, incluida: estado.get(t.id) === 'incluida', excluida: estado.get(t.id) === 'excluida',
  });
  const ativas = [...estado.keys()].filter((id) => daLista.has(id)).map((id) => daLista.get(id)).sort(porRotulo);
  const frequencia = new Map();
  for (const f of candidatos) {
    for (const id of new Set([...(f.tags ?? []), ...(f.clima ? [f.clima] : [])])) frequencia.set(id, (frequencia.get(id) ?? 0) + 1);
  }
  const demais = [...frequencia.keys()]
    .filter((id) => !estado.has(id) && daLista.has(id) && daLista.get(id).filmes >= MIN_FILMES_POR_TAG)
    .map((id) => ({ ...daLista.get(id), n: frequencia.get(id) }))
    .sort((a, b) => b.n - a.n || porRotulo(a, b));
  return [...ativas, ...demais].slice(0, MAX_CHIPS).map(modelo);
}

// Até 3 rótulos para o card: o clima primeiro e até 2 temas (incluídos pelo usuário, depois menor `filmes`, depois rótulo).
export function tagsDoCard(filme, { lista = [], incluir = [] } = {}) {
  const daLista = new Map(lista.map((t) => [t.id, t]));
  const rotulos = [];
  if (filme?.clima && daLista.has(filme.clima)) rotulos.push(daLista.get(filme.clima).rotulo);
  const escolhidos = (filme?.tags ?? [])
    .filter((id) => daLista.has(id))
    .map((id) => daLista.get(id))
    .sort((a, b) => Number(incluir.includes(b.id)) - Number(incluir.includes(a.id)) || a.filmes - b.filmes || porRotulo(a, b))
    .slice(0, MAX_TEMAS_CARD);
  return [...rotulos, ...escolhidos.map((t) => t.rotulo)].slice(0, MAX_TAGS_CARD);
}

// "Com {incluídas}. Sem {excluídas}.", rótulos em ordem pt-BR; omite a parte vazia; '' sem tags ativas.
export function textoTagsAtivas(estado, lista = []) {
  const daLista = new Map(lista.map((t) => [t.id, t]));
  const nomes = (e) => [...estado.keys()].filter((id) => estado.get(id) === e && daLista.has(id)).map((id) => daLista.get(id))
    .sort(porRotulo).map((t) => t.rotulo);
  const com = nomes('incluida');
  const sem = nomes('excluida');
  return [com.length > 0 ? `Com ${com.join(', ')}.` : '', sem.length > 0 ? `Sem ${sem.join(', ')}.` : ''].filter(Boolean).join(' ');
}

// Alvo do foco depois de refazer a lista: o mesmo botão (tag e ação); sem ele, o 1º botão dos chips; sem chips, "Recomendar".
export function alvoDoFoco({ chips = [], tag, acao }) {
  if (chips.some((c) => c.id === tag)) return { tipo: 'mesmo', tag, acao };
  if (chips.length > 0) return { tipo: 'primeiro', tag: chips[0].id, acao: 'incluir' };
  return { tipo: 'recomendar' };
}
