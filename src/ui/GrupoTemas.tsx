import { montarControle } from '../tags.mjs';
import { ControleTag } from './ControleTag';
import { LegendaTags } from './LegendaTags';

interface Props {
  lista: { id: string; rotulo: string; filmes: number }[];
  tags: Map<string, string>;
  aoAcionar: (tag: string, acao: string) => void;
  prefixo?: string;
}

// Grupo recolhível "Filtrar por tema (opcional)". O `details` NÃO é controlado pelo React (D-14, D-C): sem a prop `open`,
// o navegador alterna o atributo pelo `summary` e uma nova renderização (ex.: acionar "Quero") não fecha o grupo aberto.
export function GrupoTemas({ lista, tags, aoAcionar, prefixo = '' }: Props) {
  if (lista.length === 0) return null;
  return (
    <details id={`${prefixo}grupo-temas`}>
      <summary>Filtrar por tema (opcional)</summary>
      <fieldset>
        <legend className="so-leitor">Temas (opcional)</legend>
        <LegendaTags />
        <div id={`${prefixo}temas-controles`}>
          {lista.map((tag) => <ControleTag key={tag.id} controle={montarControle(tag, tags)} aoAcionar={aoAcionar} />)}
        </div>
      </fieldset>
    </details>
  );
}
