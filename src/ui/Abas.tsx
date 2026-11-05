import { useRef, type KeyboardEvent } from 'react';

export type AbaId = 'filmes' | 'series';

const ABAS: { id: AbaId; rotulo: string }[] = [
  { id: 'filmes', rotulo: 'Filmes' },
  { id: 'series', rotulo: 'Séries' },
];

interface Props {
  ativa: AbaId;
  aoAtivar: (id: AbaId) => void;
}

// Abas Filmes/Séries (padrão WAI-ARIA, ativação automática; design D-8). Só a aba ativa tem tabindex 0; setas movem o foco e
// ativam a outra aba (volta circular), Home ativa Filmes e End ativa Séries. Os tabpanels não têm tabindex: Tab vai ao 1º
// controle focável do painel ativo (o 1º radio de humor).
export function Abas({ ativa, aoAtivar }: Props) {
  const botoes = useRef<Partial<Record<AbaId, HTMLButtonElement | null>>>({});

  function mover(destino: AbaId) {
    aoAtivar(destino);
    botoes.current[destino]?.focus();
  }

  function aoTeclar(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    let destino: number | null = null;
    if (evento.key === 'ArrowRight' || evento.key === 'ArrowLeft') destino = (indice + 1) % ABAS.length;
    else if (evento.key === 'Home') destino = 0;
    else if (evento.key === 'End') destino = ABAS.length - 1;
    if (destino === null) return;
    evento.preventDefault();
    mover(ABAS[destino].id);
  }

  return (
    <div className="abas" role="tablist" aria-label="Tipo de recomendação">
      {ABAS.map((aba, indice) => (
        <button
          type="button"
          role="tab"
          key={aba.id}
          id={`aba-${aba.id}`}
          aria-selected={ativa === aba.id}
          aria-controls={`painel-${aba.id}`}
          tabIndex={ativa === aba.id ? 0 : -1}
          ref={(no) => { botoes.current[aba.id] = no; }}
          onClick={() => aoAtivar(aba.id)}
          onKeyDown={(evento) => aoTeclar(evento, indice)}
        >
          {aba.rotulo}
        </button>
      ))}
    </div>
  );
}
