import { carregarDados, carregarSeries } from '../dados.mjs';
import { recomendar } from '../recomendar.mjs';
import { criarEnriquecedor } from '../enriquecer.mjs';
import { criarProvedores } from '../provedores.mjs';
import { URL_WORKER } from '../config.mjs';

// A lógica pura é .mjs (checkJs desligado): os tipos inferidos dos parâmetros opcionais são estreitos demais.
const fabricaEnriquecedor = criarEnriquecedor as (opcoes: any) => any;
const fabricaProvedores = criarProvedores as (opcoes: any) => any;
const recomendarJs = recomendar as (parametros: any) => any;

// Tudo o que o App usa do mundo externo (design D-2). main.tsx passa as reais; os testes passam falsas e espiões.
export interface Logger {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

export interface Dependencias {
  // Nunca rejeita: devolve { humores, filmes, erro } (ver src/dados.mjs).
  carregarDados: () => Promise<any>;
  // Carga sob demanda da aba Séries (FILMELIER-6): mesmo contrato, devolve { humores, series, erro }.
  carregarSeries: () => Promise<any>;
  recomendar: (parametros: any) => any;
  criarEnriquecedor: () => any;
  criarProvedores: (tipo?: 'filme' | 'serie') => any;
  urlWorker: string;
  logger: Logger;
  performance: Pick<Performance, 'mark' | 'measure'>;
  rng: () => number;
  agendarQuadro: (retorno: () => void) => void;
}

export function dependenciasReais(): Dependencias {
  const fetchImpl = (url: string, opcoes?: RequestInit) => fetch(url, opcoes);
  return {
    carregarDados: () => carregarDados(fetchImpl, console),
    carregarSeries: () => carregarSeries(fetchImpl, console),
    recomendar: recomendarJs,
    criarEnriquecedor: () => fabricaEnriquecedor({ fetchImpl, logger: console }),
    criarProvedores: (tipo = 'filme') => fabricaProvedores({ urlWorker: URL_WORKER, fetchImpl, logger: console, tipo }),
    urlWorker: URL_WORKER,
    logger: console,
    performance,
    rng: Math.random,
    agendarQuadro: (retorno) => { requestAnimationFrame(() => retorno()); },
  };
}
