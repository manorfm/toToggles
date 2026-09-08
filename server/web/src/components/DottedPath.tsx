interface DottedPathProps {
  segments: string[];
}

// Renderiza um caminho de toggle segmento a segmento, com um "." estilizável entre eles
// (`.dot`, ver styles/global.css) — confirmado no protótipo real em dois lugares (get_full_jsx
// de "NewToggleModal" e "EditDrawer"), o mesmo padrão exato repetido nos dois. Extraído aqui pra
// não duplicar essa lógica uma terceira vez (CreateToggleModal.tsx/EditToggleDrawer.tsx são os
// dois chamadores atuais).
export function DottedPath({ segments }: DottedPathProps) {
  return (
    <>
      {segments.map((segment, i) => (
        <span key={i}>
          {i > 0 && <span className="dot">.</span>}
          {segment}
        </span>
      ))}
    </>
  );
}
