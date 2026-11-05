export interface Humor {
  id: string;
  rotulo: string;
  emoji: string;
}

interface Props {
  humores: Humor[];
  selecionado: string | null;
  aoEscolher: (id: string) => void;
}

// Radios de humor: o emoji é decoração (aria-hidden) e fica fora do nome acessível.
export function Humores({ humores, selecionado, aoEscolher }: Props) {
  return (
    <div id="humores">
      {humores.map((humor) => {
        const id = `humor-${humor.id}`;
        return (
          <div className="opcao" key={humor.id}>
            <input type="radio" name="humor" id={id} value={humor.id} checked={selecionado === humor.id} onChange={() => aoEscolher(humor.id)} />
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
