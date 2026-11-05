import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatarData } from '../dados.mjs';
import { listarGeneros } from '../recomendar.mjs';
import { inicializar } from '../inicializar.mjs';
import { listaDeTags } from '../tags.mjs';
import { TEXTOS_SERIES, montarCardSerie } from '../serie.mjs';
import type { Dependencias } from './dependencias';
import { TEXTO_ERRO } from './LimiteDeErro';
import { Abas, type AbaId } from './Abas';
import { Painel, type Pagina, type ConfigPainel } from './Painel';
import { Rodape } from './Rodape';

const CARREGANDO: Pagina = { status: 'carregando', humores: null, itens: [], generos: [], listaTags: [], data: '' };
const ERRO: Pagina = { ...CARREGANDO, status: 'erro' };
const OCIOSA: Pagina = { ...CARREGANDO, status: 'ociosa' };

export const TEXTO_ERRO_SERIES = 'Não foi possível carregar a lista de séries. Recarregue a página.';
const ABERTURA: Record<AbaId, string> = {
  filmes: 'Diga como você está hoje e receba sugestões de filmes.',
  series: 'Diga como você está hoje e receba sugestões de séries.',
};

// Gêneros, lista de tags (só com alguma tag ou clima na base) e data de uma base carregada.
function derivar(humores: any, itens: any[], meta: any) {
  const generos = listarGeneros(humores);
  const comTags = itens.some((i: any) => i.tags?.length > 0 || i.clima);
  return { generos, listaTags: comTags ? listaDeTags(meta) : [], data: formatarData(meta.geradoEm) };
}

export function App({ dependencias }: { dependencias: Dependencias }) {
  const [abaAtiva, setAbaAtiva] = useState<AbaId>('filmes');
  const [pagina, setPagina] = useState<Pagina>(CARREGANDO);
  const [paginaSeries, setPaginaSeries] = useState<Pagina>(OCIOSA);

  // Carga (design D-3): as derivações que podem lançar acontecem em `desenhar`, antes do único setState,
  // dentro do try de `inicializar`; exceção cai em `entrarEmErro` com 1 console.error [filmelier].
  useEffect(() => {
    let ativo = true;
    void inicializar({
      carregar: () => dependencias.carregarDados(),
      desenhar: (dados: any) => {
        if (dados.erro) {
          if (ativo) setPagina(ERRO);
          return;
        }
        // Sem filme com tags ou clima na base, a página funciona como antes das tags (sem grupo, chips nem seção no card).
        const { generos, listaTags, data } = derivar(dados.humores, dados.filmes.filmes, dados.filmes.meta);
        if (!ativo) return;
        setPagina({ status: 'pronta', humores: dados.humores, itens: dados.filmes.filmes, generos, listaTags, data });
        dependencias.performance.mark('filmelier:dados-carregados');
      },
      entrarEmErro: () => { if (ativo) setPagina(ERRO); },
      logger: dependencias.logger as Console,
    });
    return () => { ativo = false; };
  }, [dependencias]);

  // Carga das séries na 1ª ativação (D-8): só então os 2 arquivos são pedidos e as marcas `filmelier:series*` registradas.
  const carregarSeries = useCallback(() => {
    const { performance } = dependencias;
    performance.mark('filmelier:series-inicio');
    setPaginaSeries(CARREGANDO);
    void inicializar({
      carregar: () => dependencias.carregarSeries(),
      desenhar: (dados: any) => {
        if (dados.erro) {
          setPaginaSeries(ERRO);
          return;
        }
        const { generos, listaTags, data } = derivar(dados.humores, dados.series.series, dados.series.meta);
        setPaginaSeries({ status: 'pronta', humores: dados.humores, itens: dados.series.series, generos, listaTags, data });
        performance.mark('filmelier:series-carregadas');
        performance.measure('filmelier:series', 'filmelier:series-inicio', 'filmelier:series-carregadas');
      },
      entrarEmErro: () => setPaginaSeries(ERRO),
      logger: dependencias.logger as Console,
    });
  }, [dependencias]);

  const ativar = (id: AbaId) => {
    setAbaAtiva(id);
    if (id === 'series' && paginaSeries.status === 'ociosa') carregarSeries();
  };

  const configFilmes: ConfigPainel = useMemo(() => ({
    prefixo: '',
    textoErro: TEXTO_ERRO,
    filtrosDeFilme: true,
    criarProvedores: () => dependencias.criarProvedores(),
  }), [dependencias]);

  const configSeries: ConfigPainel = useMemo(() => ({
    prefixo: 'series-',
    textoErro: TEXTO_ERRO_SERIES,
    textoCarregando: 'Carregando séries…',
    filtrosDeFilme: false,
    // Séries: textos e época próprios, card de série e lote de provedores com o ID de TV (sem nota nem Oscar).
    textos: TEXTOS_SERIES,
    campoAno: 'anoInicio',
    montarCardDe: (generos: any[]) => (s: any, enriquecimento: any, provedores: any, opcoesTags: any) => montarCardSerie(s, generos, enriquecimento, provedores, opcoesTags),
    itemDoLote: (s: any) => ({ qid: s.qid, imdb: s.imdb ?? null, tmdb: s.tmdbId }),
    criarProvedores: () => dependencias.criarProvedores('serie'),
  }), [dependencias]);

  return (
    <>
      <main>
        <h1>Filmelier</h1>
        <p>{ABERTURA[abaAtiva]}</p>
        <Abas ativa={abaAtiva} aoAtivar={ativar} />
        <div role="tabpanel" id="painel-filmes" aria-labelledby="aba-filmes" hidden={abaAtiva !== 'filmes'}>
          <Painel dependencias={dependencias} pagina={pagina} config={configFilmes} ativa={abaAtiva === 'filmes'} />
        </div>
        <div role="tabpanel" id="painel-series" aria-labelledby="aba-series" hidden={abaAtiva !== 'series'}>
          {paginaSeries.status !== 'ociosa' && <Painel dependencias={dependencias} pagina={paginaSeries} config={configSeries} ativa={abaAtiva === 'series'} />}
        </div>
      </main>
      <Rodape data={abaAtiva === 'series' ? paginaSeries.data : pagina.data} />
    </>
  );
}
