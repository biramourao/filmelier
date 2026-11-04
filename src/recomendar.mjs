// Lógica pura de recomendação (sem DOM). Ver design.md D3.

const MSG_NENHUM = 'Não encontramos filmes para essa combinação. Escolha outro humor ou gênero.';

function listaDeHumores(humores) {
  return Array.isArray(humores) ? humores : humores.humores;
}

const TAMANHO_CANDIDATOS = 40;
const TAMANHO_LISTA = 5;

function numeroDoQid(qid) {
  return Number(qid.slice(1));
}

// Os 40 mais citados: sitelinks decrescente, desempate por QID numérico crescente.
export function conjuntoCandidato(elegiveis) {
  return [...elegiveis]
    .sort((a, b) => b.sitelinks - a.sitelinks || numeroDoQid(a.qid) - numeroDoQid(b.qid))
    .slice(0, TAMANHO_CANDIDATOS);
}

// Fisher-Yates parcial com o rng recebido.
function sortear(pool, k, rng) {
  const copia = [...pool];
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (copia.length - i));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, k);
}

// Com 10 ou mais candidatos e anteriores, o pool exclui os anteriores (sobram >= 5).
function selecionar(elegiveis, rng, anteriores = []) {
  const candidatos = conjuntoCandidato(elegiveis);
  const idsAnteriores = new Set(anteriores.map((a) => (typeof a === 'string' ? a : a.qid)));
  const pool = candidatos.length >= 10 && idsAnteriores.size > 0
    ? candidatos.filter((f) => !idsAnteriores.has(f.qid))
    : candidatos;
  return sortear(pool, Math.min(TAMANHO_LISTA, pool.length), rng);
}

// Devolve { nivel, filmes, aviso, mensagem }. generoQid = null significa "Qualquer gênero".
export function recomendar({ filmes, humores, humorId, generoQid = null, rng, anteriores = [] }) {
  const humor = listaDeHumores(humores).find((h) => h.id === humorId);
  const qidsDoHumor = new Set(humor ? humor.generos.map((g) => g.qid) : []);
  const doHumor = filmes.filter((f) => f.generos.some((q) => qidsDoHumor.has(q)));

  let nivel = 'humor';
  let elegiveis = doHumor;
  let aviso = '';
  if (generoQid) {
    const rotuloGenero = listarGeneros({ humores: listaDeHumores(humores) }).find((g) => g.qid === generoQid)?.rotulo ?? generoQid;
    const comGenero = filmes.filter((f) => f.generos.includes(generoQid));
    const ambos = doHumor.filter((f) => f.generos.includes(generoQid));
    const prefixo = `Não encontramos filmes para esse humor com o gênero ${rotuloGenero}.`;
    if (ambos.length > 0) {
      nivel = 'humor+genero';
      elegiveis = ambos;
    } else if (comGenero.length > 0) {
      nivel = 'genero';
      elegiveis = comGenero;
      aviso = `${prefixo} Mostrando filmes de ${rotuloGenero}.`;
    } else if (doHumor.length > 0) {
      aviso = `${prefixo} Mostrando filmes para o humor ${humor.rotulo}.`;
    }
  }
  if (elegiveis.length === 0) {
    return { nivel: 'nenhum', filmes: [], aviso: '', mensagem: MSG_NENHUM };
  }
  return { nivel, filmes: selecionar(elegiveis, rng, anteriores), aviso, mensagem: '' };
}

// Gêneros distintos da tabela de humores, em ordem alfabética pt-BR.
export function listarGeneros(tabela) {
  const mapa = new Map();
  for (const humor of tabela.humores) {
    for (const g of humor.generos) {
      if (!mapa.has(g.qid)) mapa.set(g.qid, { qid: g.qid, rotulo: g.rotulo });
    }
  }
  return [...mapa.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}
