import { vi } from 'vitest';
import { recomendar } from '../../src/recomendar.mjs';
import type { Dependencias } from '../../src/ui/dependencias';

// Humores com emoji montado pelo código do ponto: src/ e tests não precisam de pictograma literal.
const rosto = String.fromCodePoint(0x1F602);
const raio = String.fromCodePoint(0x26A1);
const lagrima = String.fromCodePoint(0x1F622);

export const HUMORES = {
  humores: [
    { id: 'leve', rotulo: 'Leve e engraçado', emoji: rosto, generos: [{ qid: 'Q1', rotulo: 'Comédia' }, { qid: 'Q2', rotulo: 'Animação' }] },
    { id: 'tenso', rotulo: 'Tenso, quero adrenalina', emoji: raio, generos: [{ qid: 'Q3', rotulo: 'Ação' }] },
    { id: 'emocionar', rotulo: 'Quero me emocionar', emoji: lagrima, generos: [{ qid: 'Q4', rotulo: 'Drama' }] },
  ],
};

export const LISTA_TAGS = [
  { id: 'bruxaria', rotulo: 'Bruxaria', filmes: 40 },
  { id: 'magia', rotulo: 'Magia', filmes: 30 },
  { id: 'sombrio', rotulo: 'Clima sombrio', filmes: 25 },
];

// 12 filmes: 8 de comédia ou animação (humor "leve"), 3 de ação e 1 de drama. Sinopse e capa vêm do enriquecimento.
export function criarFilmes() {
  const filmes: any[] = [];
  for (let i = 1; i <= 8; i += 1) {
    filmes.push({
      qid: `Q${100 + i}`, titulo: `Comédia ${i}`, ano: 1990 + i, generos: [i % 2 === 0 ? 'Q1' : 'Q2'], sitelinks: 90 - i, imdb: `tt00000${i}`,
      nota: 6 + (i % 3), tags: i <= 4 ? ['bruxaria'] : ['magia'], ...(i === 1 ? { clima: 'sombrio' } : {}),
    });
  }
  for (let i = 1; i <= 3; i += 1) {
    filmes.push({ qid: `Q${200 + i}`, titulo: `Ação ${i}`, ano: 2000 + i, generos: ['Q3'], sitelinks: 60 - i, nota: 7, oscarVitorias: i === 1 ? 2 : 0, oscarIndicacoes: i === 1 ? 3 : 0 });
  }
  filmes.push({ qid: 'Q301', titulo: 'Drama 1', ano: 2015, generos: ['Q4'], sitelinks: 40 });
  return filmes;
}

export const META = { geradoEm: '2026-11-04T12:00:00.000Z', temas: { lista: LISTA_TAGS } };

export function criarDados(sobrescrever: Record<string, unknown> = {}) {
  return { humores: HUMORES, filmes: { meta: META, filmes: criarFilmes() }, erro: null, ...sobrescrever };
}

// ---- Séries (FILMELIER-6): 7 humores de séries com gêneros de TV e 14 séries ----
export const HUMORES_SERIES = {
  humores: [
    { id: 'leve', rotulo: 'Leve e engraçado', emoji: rosto, generos: [{ qid: 'Q9335576', rotulo: 'Comédia' }, { qid: 'Q170238', rotulo: 'Sitcom' }] },
    { id: 'tenso', rotulo: 'Tenso, quero adrenalina', emoji: raio, generos: [{ qid: 'Q343782', rotulo: 'Ação' }, { qid: 'Q9335577', rotulo: 'Crime' }] },
    { id: 'emocionar', rotulo: 'Quero me emocionar', emoji: lagrima, generos: [{ qid: 'Q1366112', rotulo: 'Drama' }] },
    { id: 'pensar', rotulo: 'Quero pensar', emoji: String.fromCodePoint(0x1F914), generos: [{ qid: 'Q140472311', rotulo: 'Ficção científica' }] },
    { id: 'medo', rotulo: 'Quero sentir medo', emoji: String.fromCodePoint(0x1F47B), generos: [{ qid: 'Q20220309', rotulo: 'Terror' }] },
    { id: 'aventura', rotulo: 'Quero aventura e fantasia', emoji: String.fromCodePoint(0x1F409), generos: [{ qid: 'Q56064758', rotulo: 'Aventura' }] },
    { id: 'familia', rotulo: 'Aconchegante, para ver em família', emoji: String.fromCodePoint(0x1F3E1), generos: [{ qid: 'Q1273568', rotulo: 'Infantil' }] },
  ],
};

// 14 séries: 8 de comédia ou sitcom (humor "leve"), 3 de ação, 2 de drama e 1 de terror. Sem `tags` ou `clima` com `comTags = false`.
export function criarSeries(comTags = true) {
  const series: any[] = [];
  for (let i = 1; i <= 8; i += 1) {
    series.push({
      qid: `Q${500 + i}`, titulo: `Sitcom ${i}`, ...(i === 1 ? { tituloOriginal: 'Original Sitcom 1' } : {}), anoInicio: 1995 + i, anoFim: i % 2 === 0 ? 2005 + i : null,
      situacao: i % 2 === 0 ? 'finalizada' : 'em-andamento', temporadas: i, episodios: i * 10, generos: [i % 2 === 0 ? 'Q9335576' : 'Q170238'],
      sitelinks: 90 - i, tmdbId: 1000 + i, imdb: `tt01000${i}`,
      ...(comTags ? { tags: i <= 4 ? ['bruxaria'] : ['magia'], ...(i === 1 ? { clima: 'sombrio' } : {}) } : {}),
    });
  }
  for (let i = 1; i <= 3; i += 1) {
    series.push({ qid: `Q${600 + i}`, titulo: `Ação ${i}`, anoInicio: 2000 + i, anoFim: 2004 + i, situacao: 'cancelada', temporadas: 1, episodios: 11, generos: ['Q343782'], sitelinks: 60 - i, tmdbId: 2000 + i });
  }
  series.push({ qid: 'Q701', titulo: 'Drama 1', anoInicio: 2010, anoFim: 2013, situacao: 'finalizada', temporadas: 5, episodios: 62, generos: ['Q1366112', 'Q9335577'], sitelinks: 40, tmdbId: 3001 });
  series.push({ qid: 'Q702', titulo: 'Drama 2', anoInicio: 2012, anoFim: null, situacao: null, temporadas: null, episodios: null, generos: ['Q1366112'], sitelinks: 39, tmdbId: null });
  series.push({ qid: 'Q801', titulo: 'Terror 1', anoInicio: 2018, anoFim: null, situacao: 'em-andamento', temporadas: 2, episodios: 16, generos: ['Q20220309'], sitelinks: 35, tmdbId: 4001 });
  return series;
}

export const META_SERIES = { geradoEm: '2026-11-12T09:00:00.000Z', temas: { lista: LISTA_TAGS } };

export function criarDadosSeries(sobrescrever: Record<string, unknown> = {}) {
  return { humores: HUMORES_SERIES, series: { meta: META_SERIES, series: criarSeries() }, erro: null, ...sobrescrever };
}

export function criarEnriquecedorFalso(mapa: Map<string, any> | null = new Map()) {
  return { enriquecer: vi.fn(async (qids: string[]) => mapa ?? new Map(qids.map((q) => [q, null]))) };
}

export function criarProvedoresFalso(ativo = false, mapa: Map<string, any> = new Map()) {
  return { ativo, buscar: vi.fn(async () => mapa) };
}

export function criarLogger() {
  return { error: vi.fn(), warn: vi.fn() };
}

// Dependências falsas: dados fixos, `recomendar` real espionado (rng fixo), rede e quadro síncronos.
export function criarDependencias(sobrescrever: Partial<Dependencias> = {}): Dependencias {
  return {
    carregarDados: vi.fn(async () => criarDados()),
    carregarSeries: vi.fn(async () => criarDadosSeries()),
    recomendar: vi.fn(recomendar as (parametros: any) => any),
    criarEnriquecedor: () => criarEnriquecedorFalso(),
    criarProvedores: () => criarProvedoresFalso(false),
    urlWorker: '',
    logger: criarLogger(),
    performance: { mark: vi.fn(), measure: vi.fn() } as unknown as Performance,
    rng: () => 0.5,
    agendarQuadro: (retorno) => retorno(),
    ...sobrescrever,
  };
}
