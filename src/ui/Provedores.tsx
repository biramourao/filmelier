import { useId } from 'react';

function Categoria({ categoria }: { categoria: any }) {
  const idRotulo = useId();
  return (
    <div className="categoria-provedores">
      <p className="rotulo-categoria" id={idRotulo}>{categoria.rotulo}</p>
      <ul className="lista-provedores" aria-labelledby={idRotulo}>
        {categoria.provedores.map((p: any) => (
          <li key={p.id}>
            {p.logo
              ? <img loading={p.logo.loading} referrerPolicy={p.logo.referrerPolicy} src={p.logo.src} alt={p.logo.alt} width={p.logo.width} height={p.logo.height} />
              : <span className="nome-provedor">{p.nome}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Seção "Onde assistir no Brasil": sempre o último bloco do card. Nada do Worker vira HTML: só texto e atributos.
export function Provedores({ secao }: { secao: any }) {
  return (
    <div className="provedores" role="group" aria-label="Onde assistir no Brasil">
      {secao.estado !== 'com-dados'
        ? <p className="estado-provedores">{secao.texto}</p>
        : (
          <>
            <p className="atribuicao-provedores">
              {secao.atribuicao.url
                ? <a href={secao.atribuicao.url} target={secao.atribuicao.target} rel={secao.atribuicao.rel}>{secao.atribuicao.texto}</a>
                : <span>{secao.atribuicao.texto}</span>}
            </p>
            {secao.categorias.map((c: any) => <Categoria key={c.chave} categoria={c} />)}
          </>
        )}
    </div>
  );
}
