import type { ReactNode } from 'react';

interface Props {
  // Texto da região live: só aviso, tags ativas e títulos; nunca sinopse (R-1).
  resumo: string;
  aviso: string;
  // Chips de refino (div#chips), entre o aviso e a lista.
  chips?: ReactNode;
  // Itens `li` da lista (1 por filme).
  itens: ReactNode;
  mostrarOutras: boolean;
  aoOutras: () => void;
  prefixo?: string;
}

// Região de resultado. Nenhum ancestral da lista tem aria-live; só o resumo curto é região live.
export function Resultado({ resumo, aviso, chips, itens, mostrarOutras, aoOutras, prefixo = '' }: Props) {
  return (
    <>
      <section id={`${prefixo}resultado`}>
        <p id={`${prefixo}resumo-lista`} className="so-leitor" aria-live="polite">{resumo}</p>
        {aviso !== '' && <p id={`${prefixo}aviso`}>{aviso}</p>}
        {chips}
        <ul id={`${prefixo}lista`}>{itens}</ul>
      </section>
      <button type="button" id={`${prefixo}outras`} hidden={!mostrarOutras} onClick={aoOutras}>Outras sugestões</button>
    </>
  );
}
