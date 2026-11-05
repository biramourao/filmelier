// Cliente do TMDB para o build de séries (FILMELIER-6, D-4 / RV-4). Isolado do cliente de filmes (temas.mjs):
// espera de 429 de até 300 s, 5xx e demais falhas caem no fallback na 1ª ocorrência, prazo global injetado.

import { ErroBuild } from './wdqs.mjs';
import { exigirToken } from './temas.mjs';

export const BASE_TMDB_SERIES = 'https://api.themoviedb.org/3';
export const TIMEOUT_SERIES_MS = 10000;
const TENTATIVAS = 3;
const ESPERA_PADRAO_MS = 10000;
const ESPERA_MAX_MS = 300000;

// Retry-After inteiro de 1 a 300 s -> ms; acima de 300 -> 300.000; ausente, 0 ou inválido -> 10.000.
export function esperaDe429(valor) {
  const texto = String(valor ?? '').trim();
  if (!/^\d+$/.test(texto)) return ESPERA_PADRAO_MS;
  const segundos = Number(texto);
  if (segundos < 1) return ESPERA_PADRAO_MS;
  return Math.min(segundos * 1000, ESPERA_MAX_MS);
}

const lerCabecalho = (resp, nome) => (typeof resp?.headers?.get === 'function' ? resp.headers.get(nome) : resp?.headers?.[nome]);

// `pedir` devolve { ok: true, dados } | { ok: false, motivo }; 401 e prazo lançam ErroBuild.
export function criarClienteSeries({
  token, fetch: fetchImpl, esperar, criarSinal = (ms) => AbortSignal.timeout(ms), agora = () => Date.now(), limite = Infinity,
}) {
  const credencial = exigirToken(token);
  let requisicoes = 0;
  async function pedir(caminho) {
    let motivo = 'desconhecido';
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      requisicoes += 1;
      let resp;
      try {
        resp = await fetchImpl(`${BASE_TMDB_SERIES}${caminho}`, {
          headers: { Authorization: `Bearer ${credencial}`, Accept: 'application/json' },
          signal: criarSinal(TIMEOUT_SERIES_MS),
        });
      } catch (erro) {
        return { ok: false, motivo: `rede: ${erro?.name === 'TimeoutError' || erro?.name === 'AbortError' ? 'timeout' : 'erro'}` };
      }
      if (resp.status === 401) {
        throw new ErroBuild('TMDB recusou a autorização (HTTP 401); troque a chave (README, rotação da chave)', { invariante: 'tmdb-autorizacao' });
      }
      if (resp.status === 429) {
        motivo = 'http-429';
        if (tentativa >= TENTATIVAS) break;
        const espera = esperaDe429(lerCabecalho(resp, 'retry-after'));
        if (agora() + espera > limite) {
          throw new ErroBuild('prazo interno do build de séries estouraria na espera do HTTP 429', { invariante: 'prazo' });
        }
        await esperar(espera);
        continue;
      }
      if (!resp.ok) return { ok: false, motivo: `http-${resp.status}` };
      try {
        return { ok: true, dados: await resp.json() };
      } catch {
        return { ok: false, motivo: 'json-invalido' };
      }
    }
    return { ok: false, motivo };
  }
  return { pedir, requisicoes: () => requisicoes };
}

const inteiro = (v) => (Number.isInteger(v) ? v : null);
const texto = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);

// 1 chamada: GET /tv/{id}?language=pt-BR&append_to_response=keywords. Devolve { ok: true, serie } | { ok: false, motivo }.
// `serie` = { name, originalName, status, temporadas, episodios, ultimaExibicao, keywords: [nomes] }.
export async function lerSerieTmdb(cliente, id) {
  const r = await cliente.pedir(`/tv/${id}?language=pt-BR&append_to_response=keywords`);
  if (!r.ok) return r;
  const d = r.dados;
  if (typeof d !== 'object' || d === null || Array.isArray(d)) return { ok: false, motivo: 'json-invalido' };
  const resultados = d.keywords && typeof d.keywords === 'object' && Array.isArray(d.keywords.results) ? d.keywords.results : [];
  return {
    ok: true,
    serie: {
      name: texto(d.name),
      originalName: texto(d.original_name),
      status: typeof d.status === 'string' ? d.status : null,
      temporadas: inteiro(d.number_of_seasons),
      episodios: inteiro(d.number_of_episodes),
      ultimaExibicao: typeof d.last_air_date === 'string' ? d.last_air_date : null,
      keywords: resultados.map((k) => k?.name).filter((n) => typeof n === 'string' && n !== ''),
    },
  };
}
