import { useId } from 'react';

interface Botao {
  acao: string;
  tag: string;
  icone: string;
  nome: string;
  pressionado: boolean;
}

interface Props {
  // Modelo de `montarControle` (src/tags.mjs).
  controle: { id: string; rotulo: string; botoes: Botao[] };
  chip?: boolean;
  aoAcionar: (tag: string, acao: string) => void;
}

// Controle de uma tag (D-6): rótulo visível 1 vez e 2 botões, "+" (Quero) e "−" (Não quero), com aria-pressed.
// O nome acessível vem do texto `.so-leitor` e contém o rótulo visível (WCAG 2.5.3); o ícone é decoração.
export function ControleTag({ controle, chip = false, aoAcionar }: Props) {
  const idRotulo = useId();
  return (
    <div className={chip ? 'tag-controle chip' : 'tag-controle'} role="group" aria-labelledby={idRotulo}>
      <span className="tag-rotulo" id={idRotulo}>{controle.rotulo}</span>
      {controle.botoes.map((b) => (
        <button
          type="button"
          key={b.acao}
          aria-pressed={b.pressionado}
          data-tag={b.tag}
          data-acao={b.acao}
          onClick={() => aoAcionar(b.tag, b.acao)}
        >
          <span className="tag-icone" aria-hidden="true">{b.icone}</span>
          <span className="so-leitor">{b.nome}</span>
        </button>
      ))}
    </div>
  );
}
