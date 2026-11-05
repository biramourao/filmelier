import { useEffect, useRef, useState } from 'react';
import { formatarData } from '../dados.mjs';
import { listarGeneros } from '../recomendar.mjs';
import { inicializar } from '../inicializar.mjs';
import { criarSessaoLista as criarSessaoListaJs } from '../lista.mjs';
import {
  listaDeTags, alternar, filtroDoEstado, montarChips as montarChipsJs, textoTagsAtivas as textoTagsAtivasJs, alvoDoFoco as alvoDoFocoJs,
} from '../tags.mjs';
import type { Dependencias } from './dependencias';
import { TEXTO_ERRO } from './LimiteDeErro';
import { Formulario, FILTROS_VAZIOS, type Filtros } from './Formulario';
import { Resultado } from './Resultado';
import { Card } from './Card';
import { GrupoTemas } from './GrupoTemas';
import { Chips } from './Chips';
import { Rodape } from './Rodape';

interface Pagina {
  status: 'carregando' | 'pronta' | 'erro';
  humores: any;
  filmes: any;
  generos: { qid: string; rotulo: string }[];
  listaTags: { id: string; rotulo: string; filmes: number }[];
  data: string;
}

// O que está na tela depois de "Recomendar": o retorno de `recomendar`, os cards da sessão e o texto da região live.
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

const CARREGANDO: Pagina = { status: 'carregando', humores: null, filmes: null, generos: [], listaTags: [], data: '' };
const ERRO: Pagina = { ...CARREGANDO, status: 'erro' };

export function App({ dependencias }: { dependencias: Dependencias }) {
  const [pagina, setPagina] = useState<Pagina>(CARREGANDO);
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
        const generos = listarGeneros(dados.humores);
        // Sem filme com tags ou clima na base, a página funciona como antes das tags (sem grupo, chips nem seção no card).
        const comTags = dados.filmes.filmes.some((f: any) => f.tags?.length > 0 || f.clima);
        const listaTags = comTags ? listaDeTags(dados.filmes.meta) : [];
        const data = formatarData(dados.filmes.meta.geradoEm);
        if (!ativo) return;
        const { performance } = dependencias;
        const provedores = dependencias.criarProvedores();
        provedoresAtivos.current = provedores?.ativo === true;
        // A sessão descarta gerações antigas: `aoAtualizar` e `aoProvedores` só chegam para a geração atual.
        sessao.current = criarSessaoLista({
          enriquecedor: dependencias.criarEnriquecedor(),
          generos,
          provedores,
          lista: listaTags,
          incluirAtual: () => filtroDoEstado(tagsAtuais.current).incluir,
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
        setPagina({ status: 'pronta', humores: dados.humores, filmes: dados.filmes, generos, listaTags, data });
        performance.mark('filmelier:dados-carregados');
      },
      entrarEmErro: () => { if (ativo) setPagina(ERRO); },
      logger: dependencias.logger as Console,
    });
    return () => { ativo = false; };
  }, [dependencias]);

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
    const botoes = [...document.querySelectorAll<HTMLButtonElement>('#chips button[data-tag]')];
    const botao = alvo.tipo === 'recomendar' ? null : botoes.find((b) => b.dataset.tag === alvo.tag && b.dataset.acao === alvo.acao);
    (botao ?? document.getElementById('recomendar'))?.focus();
  }, [exibicao]);

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
      filmes: pagina.filmes.filmes,
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

  return (
    <>
      <main>
        <h1>Filmelier</h1>
        <p>Diga como você está hoje e receba sugestões de filmes.</p>
        <Formulario
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
          temas={<GrupoTemas lista={pagina.listaTags} tags={tags} aoAcionar={alternarTagDoFormulario} />}
        />
        <p id="erro" role="alert" hidden={pagina.status !== 'erro'}>{TEXTO_ERRO}</p>
        <Resultado
          resumo={exibicao?.resumo ?? ''}
          aviso={exibicao?.aviso ?? ''}
          chips={<Chips chips={exibicao?.chips ?? []} tags={tags} aoAcionar={alternarTagDoChip} />}
          itens={(exibicao?.cards ?? []).map((card, i) => (
            <Card key={exibicao!.qids[i]} card={card} enriquecido={exibicao!.enriquecido} agendarQuadro={dependencias.agendarQuadro} />
          ))}
          mostrarOutras={exibicao !== null && exibicao.nivel !== 'nenhum'}
          aoOutras={() => sugerir(exibicao?.qids ?? [])}
        />
      </main>
      <Rodape data={pagina.data} />
    </>
  );
}
