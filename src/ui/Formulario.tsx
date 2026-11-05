import type { ReactNode } from 'react';
import { Humores, type Humor } from './Humores';

export interface Filtros {
  anoDe: string;
  anoAte: string;
  notaMin: string;
  oscar: string;
}

export const FILTROS_VAZIOS: Filtros = { anoDe: '', anoAte: '', notaMin: '', oscar: '' };

// Épocas por década: "De" começa na década, "Até" termina no último ano dela.
const DE = [1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
const ATE = [1929, 1939, 1949, 1959, 1969, 1979, 1989, 1999, 2009, 2019, 2029];
const NOTAS = [5, 6, 7, 8, 9];

interface Props {
  humores: Humor[];
  generos: { qid: string; rotulo: string }[];
  pronta: boolean;
  humor: string | null;
  genero: string;
  filtros: Filtros;
  aoEscolherHumor: (id: string) => void;
  aoMudarGenero: (qid: string) => void;
  aoMudarFiltro: (campo: keyof Filtros, valor: string) => void;
  aoEnviar: () => void;
  // Grupo de temas (opcional), entre o filtro de Oscar e o botão "Recomendar".
  temas?: ReactNode;
  // FILMELIER-6: prefixo de todo id, `htmlFor` e `name` ('' em Filmes, 'series-' em Séries) e, com `false`, o formulário
  // omite "Nota mínima" e "Oscar" (séries não têm nota nem prêmio).
  prefixo?: string;
  filtrosDeFilme?: boolean;
}

export function Formulario({
  humores, generos, pronta, humor, genero, filtros, aoEscolherHumor, aoMudarGenero, aoMudarFiltro, aoEnviar, temas, prefixo = '', filtrosDeFilme = true,
}: Props) {
  return (
    <form id={`${prefixo}formulario`} onSubmit={(evento) => { evento.preventDefault(); aoEnviar(); }}>
      <fieldset>
        <legend>Qual é o seu humor hoje?</legend>
        <Humores humores={humores} selecionado={humor} aoEscolher={aoEscolherHumor} prefixo={prefixo} />
      </fieldset>

      <div className="campo">
        <label htmlFor={`${prefixo}genero`}>Gênero (opcional)</label>
        <select id={`${prefixo}genero`} value={genero} onChange={(e) => aoMudarGenero(e.target.value)}>
          <option value="">Qualquer gênero</option>
          {generos.map((g) => <option key={g.qid} value={g.qid}>{g.rotulo}</option>)}
        </select>
      </div>

      <fieldset className="epoca">
        <legend>Época</legend>
        <div className="periodo">
          <div className="campo">
            <label htmlFor={`${prefixo}ano-de`}>De</label>
            <select id={`${prefixo}ano-de`} value={filtros.anoDe} onChange={(e) => aoMudarFiltro('anoDe', e.target.value)}>
              <option value="">Qualquer</option>
              {DE.map((ano) => <option key={ano} value={String(ano)}>{ano}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor={`${prefixo}ano-ate`}>Até</label>
            <select id={`${prefixo}ano-ate`} value={filtros.anoAte} onChange={(e) => aoMudarFiltro('anoAte', e.target.value)}>
              <option value="">Qualquer</option>
              {ATE.map((ano) => <option key={ano} value={String(ano)}>{ano}</option>)}
            </select>
          </div>
        </div>
      </fieldset>

      {filtrosDeFilme && (
        <>
          <div className="campo">
            <label htmlFor={`${prefixo}nota-min`}>Nota mínima</label>
            <select id={`${prefixo}nota-min`} value={filtros.notaMin} onChange={(e) => aoMudarFiltro('notaMin', e.target.value)}>
              <option value="">Qualquer</option>
              {NOTAS.map((nota) => <option key={nota} value={String(nota)}>{nota}+</option>)}
            </select>
          </div>

          <div className="campo">
            <label htmlFor={`${prefixo}oscar`}>Oscar</label>
            <select id={`${prefixo}oscar`} value={filtros.oscar} onChange={(e) => aoMudarFiltro('oscar', e.target.value)}>
              <option value="">Qualquer</option>
              <option value="indicado">Indicado</option>
              <option value="vencedor">Vencedor</option>
            </select>
          </div>
        </>
      )}

      {temas}

      <button type="submit" id={`${prefixo}recomendar`} disabled={!(pronta && humor)}>Recomendar</button>
    </form>
  );
}
