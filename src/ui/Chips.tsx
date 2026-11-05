import { montarControle } from '../tags.mjs';
import { ControleTag } from './ControleTag';
import { LegendaTags } from './LegendaTags';

interface Props {
  // Modelo de `montarChips` (src/tags.mjs): tags ativas primeiro, depois as do conjunto candidato (máximo de 10).
  chips: { id: string; rotulo: string }[];
  tags: Map<string, string>;
  aoAcionar: (tag: string, acao: string) => void;
  prefixo?: string;
}

// Chips acima da lista (D-6): sem chip o grupo fica vazio e oculto.
export function Chips({ chips, tags, aoAcionar, prefixo = '' }: Props) {
  return (
    <div id={`${prefixo}chips`} role="group" aria-label="Refinar por tema" hidden={chips.length === 0}>
      {chips.length > 0 && <LegendaTags />}
      {chips.map((c) => <ControleTag key={c.id} chip controle={montarControle({ id: c.id, rotulo: c.rotulo }, tags)} aoAcionar={aoAcionar} />)}
    </div>
  );
}
