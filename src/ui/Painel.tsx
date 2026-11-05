import { useEffect, useMemo, useRef, useState } from 'react';
import { alternar, filtroDoEstado, montarChips as montarChipsJs, textoTagsAtivas as textoTagsAtivasJs, alvoDoFoco as alvoDoFocoJs } from '../tags.mjs';
import { criarSessaoLista as criarSessaoListaJs } from '../lista.mjs';
import type { Dependencias } from './dependencias';
import { Formulario, FILTROS_VAZIOS, type Filtros } from './Formulario';
import { Resultado } from './Resultado';
import { Card } from './Card';
import { GrupoTemas } from './GrupoTemas';
import { Chips } from './Chips';

// Dados de 1 aba. `itens` é a lista de filmes (ou de séries) do arquivo de dados.
export interface Pagina {
  status: 'ociosa' | 'carregando' | 'pronta' | 'erro';
  humores: any;
  itens: any[];
  generos: { qid: string; rotulo: string }[];
  listaTags: { id: string; rotulo: string; filmes: number }[];
  data: string;
}

// Configuração de 1 aba (design D-8). Em Filmes só `prefixo` e `textoErro` são obrigatórios: os demais campos vazios
// reproduzem o painel de sempre.
export interface ConfigPainel {
  prefixo: string;
  textoErro: string;
  // Texto exibido enquanto a aba carrega (só Séries; Filmes carrega junto com a página).
  textoCarregando?: string;
  filtrosDeFilme: boolean;
  // `recomendar({ textos, campoAno })`; indefinidos = padrões dos filmes.
  textos?: any;
  campoAno?: string;
  // Fábrica do card e do item do lote de provedores (padrões de filmes em src/lista.mjs).
  montarCardDe?: (generos: any[]) => (item: any, enriquecimento: any, provedores: any, opcoesTags: any) => any;
  itemDoLote?: (item: any) => any;
  criarProvedores: () => any;
}

interface Exibicao {
  geracao: number;
  aviso: string;
  resumo: string;
  nivel: string;
  chips: { id: string; rotulo: string }[];
  qids: string[];
  cards: any[];
  enriquecido: boolean;
}

// Lógica pura em .mjs (checkJs desligado): tipos inferidos dos parâmetros opcionais são estreitos demais.
const criarSessaoLista = criarSessaoListaJs as (opcoes: any) => any;
const montarChips = montarChipsJs as (opcoes: any) => { id: string; rotulo: string }[];
const alvoDoFoco = alvoDoFocoJs as (opcoes: any) => { tipo: string; tag?: string; acao?: string };
const textoTagsAtivas = textoTagsAtivasJs as (estado: Map<string, string>, lista: any[]) => string;

interface Props {
  dependencias: Dependencias;
  pagina: Pagina;
  config: ConfigPainel;
  // `false` com o wrapper do painel oculto (`hidden`): o enriquecimento que chega nesse intervalo não é medido (D-8).
  ativa?: boolean;
}

// Estado e fluxo de 1 aba (humor, gênero, filtros, tags, sessão da lista, resultado), extraído de App (FILMELIER-6, D-8).
// Painéis independentes preservam o próprio estado sem armazenamento.
export function Painel({ dependencias, pagina, config, ativa = true }: Props) {
  const { prefixo } = config;
  const [humor, setHumor] = useState<string | null>(null);
  const [genero, setGenero] = useState('');
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [exibicao, setExibicao] = useState<Exibicao | null>(null);
  const [tags, setTags] = useState<Map<string, string>>(new Map());
  const sessao = useRef<any>(null);
  // Estado de tags lido pela sessão na hora de montar os cards (o card destaca as tags incluídas agora).
  const tagsAtuais = useRef<Map<string, string>>(tags);
  const focoPendente = useRef<{ tipo: string; tag?: string; acao?: string } | null>(null);
  const provedoresAtivos = useRef(false);

  // A sessão nasce quando os dados ficam prontos. A sessão descarta gerações antigas: `aoAtualizar` e `aoProvedores`
  // só chegam para a geração atual.
  useEffect(() => {
    if (pagina.status !== 'pronta') return undefined;
    let ativo = true;
    const { performance } = dependencias;
    const provedores = config.criarProvedores();
    provedoresAtivos.current = provedores?.ativo === true;
    sessao.current = criarSessaoLista({
      enriquecedor: dependencias.criarEnriquecedor(),
      generos: pagina.generos,
      provedores,
      lista: pagina.listaTags,
      incluirAtual: () => filtroDoEstado(tagsAtuais.current).incluir,
      ...(config.montarCardDe ? { montarCardDe: config.montarCardDe(pagina.generos) } : {}),
      ...(config.itemDoLote ? { itemDoLote: config.itemDoLote } : {}),
      aoAtualizar: (cards: any[], geracao: number) => {
        if (!ativo) return;
        setExibicao((e) => (e && e.geracao === geracao ? { ...e, cards, enriquecido: true } : e));
        performance.mark('filmelier:enriquecimento-fim');
        performance.measure('filmelier:enriquecimento', 'filmelier:recomendar-inicio', 'filmelier:enriquecimento-fim');
      },
      aoProvedores: (cards: any[], geracao: number) => {
        if (!ativo) return;
        setExibicao((e) => (e && e.geracao === geracao ? { ...e, cards } : e));
        performance.mark('filmelier:provedores-fim');
        performance.measure('filmelier:provedores', 'filmelier:provedores-inicio', 'filmelier:provedores-fim');
      },
    });
    return () => { ativo = false; };
  }, [pagina, dependencias, config]);

  // Medida do clique até o quadro seguinte ao commit da nova geração (design D-4).
  const geracaoExibida = exibicao?.geracao;
  useEffect(() => {
    if (geracaoExibida === undefined) return;
    dependencias.agendarQuadro(() => {
      dependencias.performance.mark('filmelier:lista-renderizada');
      dependencias.performance.measure('filmelier:recomendar', 'filmelier:recomendar-inicio', 'filmelier:lista-renderizada');
    });
  }, [geracaoExibida, dependencias]);

  // Foco depois de refazer a lista por um chip: o mesmo botão; senão o 1º chip; senão "Recomendar".
  useEffect(() => {
    const alvo = focoPendente.current;
    if (!alvo) return;
    focoPendente.current = null;
    const botoes = [...document.querySelectorAll<HTMLButtonElement>(`#${prefixo}chips button[data-tag]`)];
    const botao = alvo.tipo === 'recomendar' ? null : botoes.find((b) => b.dataset.tag === alvo.tag && b.dataset.acao === alvo.acao);
    (botao ?? document.getElementById(`${prefixo}recomendar`))?.focus();
  }, [exibicao, prefixo]);

  // Qualquer mudança no formulário descarta o enriquecimento em voo e limpa lista, chips, aviso e região live.
  function limpar() {
    sessao.current?.invalidar();
    setExibicao(null);
  }

  // Recomenda com o estado do formulário (marca de início antes do cálculo, como a página anterior).
  function sugerir(anteriores: string[], estadoTags: Map<string, string> = tags): { chips: { id: string; rotulo: string }[] } | null {
    if (!humor || pagina.status !== 'pronta') return null;
    const { performance } = dependencias;
    performance.mark('filmelier:recomendar-inicio');
    const num = (v: string) => (v === '' ? null : Number(v));
    const resultado = dependencias.recomendar({
      filmes: pagina.itens,
      humores: pagina.humores,
      humorId: humor,
      generoQid: genero || null,
      anoDe: num(filtros.anoDe),
      anoAte: num(filtros.anoAte),
      notaMin: num(filtros.notaMin),
      oscar: filtros.oscar,
      rng: dependencias.rng,
      anteriores,
      ...filtroDoEstado(estadoTags),
      tagsValidas: pagina.listaTags.map((t) => t.id),
      ...(config.textos ? { textos: config.textos } : {}),
      ...(config.campoAno ? { campoAno: config.campoAno } : {}),
    });
    const aviso = resultado.nivel === 'nenhum' ? resultado.mensagem : resultado.aviso;
    // O lote de provedores parte dentro de `exibir`: a marca de início vem antes (FILMELIER-3, D-11).
    if (provedoresAtivos.current) performance.mark('filmelier:provedores-inicio');
    const { cards, geracao } = sessao.current.exibir(resultado);
    const titulos = cards.map((c: any) => c.titulo);
    const chips = montarChips({ candidatos: resultado.candidatos ?? [], estado: estadoTags, lista: pagina.listaTags });
    const lista = cards.length > 0 ? `${cards.length} ${cards.length === 1 ? 'sugestão' : 'sugestões'}: ${titulos.join(', ')}.` : '';
    setExibicao({
      geracao,
      aviso,
      resumo: [aviso, textoTagsAtivas(estadoTags, pagina.listaTags), lista].filter(Boolean).join(' '),
      nivel: resultado.nivel,
      chips,
      qids: resultado.filmes.map((f: any) => f.qid),
      cards,
      enriquecido: false,
    });
    return { chips };
  }

  function aplicarTags(novas: Map<string, string>) {
    tagsAtuais.current = novas;
    setTags(novas);
  }

  // Tag alterada pelo formulário: só muda o estado e limpa o resultado até novo "Recomendar".
  function alternarTagDoFormulario(id: string, acao: string) {
    aplicarTags(alternar(tags, id, acao));
    limpar();
  }

  // Chip acionado: muda o estado e refaz a recomendação na hora (mesmo humor, gênero e filtros), sem "Recomendar".
  function alternarTagDoChip(id: string, acao: string) {
    if (!humor || pagina.status !== 'pronta') return;
    const novas = alternar(tags, id, acao);
    aplicarTags(novas);
    const refeito = sugerir([], novas);
    if (!refeito) return;
    focoPendente.current = alvoDoFoco({ chips: refeito.chips, tag: id, acao });
  }

  const alterar = (aplicar: () => void) => { aplicar(); limpar(); };

  // "Ler mais" com o painel oculto (display: none): a medição da sinopse leria 0/0 e gravaria `estoura = false`. Oculto, a
  // função não agenda nada; ao voltar, a identidade muda e o efeito da Sinopse remede com o painel visível. Sem troca de
  // aba a identidade é a de `dependencias.agendarQuadro`, como antes.
  const agendarQuadroPainel = useMemo(
    () => (ativa ? dependencias.agendarQuadro : (_retorno: () => void) => {}),
    [ativa, dependencias.agendarQuadro],
  );

  return (
    <>
      <Formulario
        prefixo={prefixo}
        filtrosDeFilme={config.filtrosDeFilme}
        humores={pagina.humores?.humores ?? []}
        generos={pagina.generos}
        pronta={pagina.status === 'pronta'}
        humor={humor}
        genero={genero}
        filtros={filtros}
        aoEscolherHumor={(id) => alterar(() => setHumor(id))}
        aoMudarGenero={(qid) => alterar(() => setGenero(qid))}
        aoMudarFiltro={(campo, valor) => alterar(() => setFiltros((f) => ({ ...f, [campo]: valor })))}
        aoEnviar={() => sugerir([])}
        temas={<GrupoTemas prefixo={prefixo} lista={pagina.listaTags} tags={tags} aoAcionar={alternarTagDoFormulario} />}
      />
      {config.textoCarregando && pagina.status === 'carregando' && <p id={`${prefixo}carregando`}>{config.textoCarregando}</p>}
      <p id={`${prefixo}erro`} role="alert" hidden={pagina.status !== 'erro'}>{config.textoErro}</p>
      <Resultado
        prefixo={prefixo}
        resumo={exibicao?.resumo ?? ''}
        aviso={exibicao?.aviso ?? ''}
        chips={<Chips prefixo={prefixo} chips={exibicao?.chips ?? []} tags={tags} aoAcionar={alternarTagDoChip} />}
        itens={(exibicao?.cards ?? []).map((card, i) => (
          <Card key={exibicao!.qids[i]} card={card} enriquecido={exibicao!.enriquecido} agendarQuadro={agendarQuadroPainel} />
        ))}
        mostrarOutras={exibicao !== null && exibicao.nivel !== 'nenhum'}
        aoOutras={() => sugerir(exibicao?.qids ?? [])}
      />
    </>
  );
}
