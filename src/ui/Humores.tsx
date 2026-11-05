export interface Humor {
  id: string;
  rotulo: string;
  emoji: string;
}

interface Props {
  humores: Humor[];
  selecionado: string | null;
  aoEscolher: (id: string) => void;
  // FILMELIER-6: prefixo de todo id e do `name` dos radios ('' em Filmes, 'series-' em Séries).
  prefixo?: string;
}

// Radios de humor: o emoji é decoração (aria-hidden) e fica fora do nome acessível.
export function Humores({ humores, selecionado, aoEscolher, prefixo = '' }: Props) {
  return (
    <div id={`${prefixo}humores`}>
      {humores.map((humor) => {
        const id = `${prefixo}humor-${humor.id}`;
        return (
          <div className="opcao" key={humor.id}>
            <input type="radio" name={`${prefixo}humor`} id={id} value={humor.id} checked={selecionado === humor.id} onChange={() => aoEscolher(humor.id)} />
            <label htmlFor={id}>
              <span className="emoji" aria-hidden="true">{humor.emoji}</span>
              {humor.rotulo}
            </label>
          </div>
        );
      })}
    </div>
  );
}
