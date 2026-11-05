// Modelo da lista e aplicação tardia do enriquecimento (design.md D-2, D-6). Sem DOM.
// FILMELIER-3 (design D-8): os provedores chegam por notificação própria (`aoProvedores`), separada de `aoAtualizar`.

import { montarCard } from './card.mjs';
import { montarItem } from './item.mjs';
import { SEM_ENTRADA } from './provedores.mjs';

// FILMELIER-4 (D-13): `lista` (de listaDeTags) e `incluirAtual` (devolve os ids incluídos agora) vão a montarCard; sem lista, card sem tags.
// FILMELIER-6 (D-7): `montarCardDe(item, enriquecimento, provedores, opcoesTags)` e `itemDoLote(item)` generalizam o card e o
// item enviado ao cliente de provedores; os padrões são o código de filmes de sempre (séries passam montarCardSerie e o tmdb).
export function criarSessaoLista({
  enriquecedor, generos, aoAtualizar, provedores = null, aoProvedores = () => {}, lista = [], incluirAtual = () => [],
  montarCardDe = (f, enriquecimento, estado, opcoesTags) => montarCard(montarItem(f, generos), enriquecimento, estado, opcoesTags),
  itemDoLote = (f) => ({ qid: f.qid, imdb: f.imdb ?? null }),
}) {
  let geracao = 0;
  const comProvedores = provedores?.ativo === true;

  // Estado dos provedores de 1 card: nulo (recurso desligado), "buscando" (sem mapa ainda) ou o resultado.
  const estadoProvedores = (qid, mapaProv) => {
    if (!comProvedores) return null;
    if (!mapaProv) return { estado: 'buscando' };
    return mapaProv.get(qid) ?? SEM_ENTRADA;
  };

  const montar = (filmes, mapa, mapaProv = null) => filmes.map((f) => montarCardDe(
    f, mapa?.get(f.qid) ?? null, estadoProvedores(f.qid, mapaProv),
    lista.length > 0 ? { lista, incluir: incluirAtual() } : null,
  ));

  // Devolve de forma síncrona { geracao, cards, concluido, concluidoProvedores }: os cards já saem completos,
  // com placeholder. `concluido` resolve (nunca rejeita) quando o enriquecimento termina; os cards enriquecidos
  // só vão para `aoAtualizar` se esta ainda for a geração atual. `concluidoProvedores` faz o mesmo para os
  // provedores e `aoProvedores`. Cada notificação usa o estado mais recente dos 2 mapas.
  function exibir(resultado) {
    geracao += 1;
    const minha = geracao;
    const filmes = resultado.filmes;
    let mapaEnriq = null;
    let mapaProv = null;
    const cards = montar(filmes, null);
    const concluido = enriquecedor.enriquecer(filmes.map((f) => f.qid)).then(
      (mapa) => {
        if (minha !== geracao) return;
        mapaEnriq = mapa;
        aoAtualizar(montar(filmes, mapaEnriq, mapaProv), minha);
      },
      () => {},
    );
    const concluidoProvedores = comProvedores
      ? provedores.buscar(filmes.map(itemDoLote)).then(
        (mapa) => {
          if (minha !== geracao) return;
          mapaProv = mapa;
          aoProvedores(montar(filmes, mapaEnriq, mapaProv), minha);
        },
        () => {},
      )
      : Promise.resolve();
    return { geracao: minha, cards, concluido, concluidoProvedores };
  }

  // Descarta o enriquecimento em voo (troca de humor ou gênero): só incrementa a geração.
  function invalidar() {
    geracao += 1;
  }

  return { exibir, invalidar };
}
