import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Texto recortado em N linhas com "Ver mais"/"Ver menos".
 * O botão só aparece quando o texto realmente estoura o limite.
 */
export function TextoExpansivel({
  texto,
  linhas = 2,
  className,
  limiteChars = 140,
}: {
  texto: string;
  linhas?: number;
  className?: string;
  limiteChars?: number;
}) {
  const [aberto, setAberto] = useState(false);
  const longo = texto.length > limiteChars || texto.split("\n").length > linhas;

  return (
    <div className={cn("min-w-0", className)}>
      <p className={cn("whitespace-pre-wrap break-words", !aberto && longo && "line-clamp-2")}>
        {texto}
      </p>
      {longo && (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-primary hover:underline"
        >
          {aberto ? "Ver menos" : "Ver mais"}
        </button>
      )}
    </div>
  );
}
