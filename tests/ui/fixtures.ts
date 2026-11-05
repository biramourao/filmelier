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
