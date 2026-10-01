/**
 * Selo "Cadastro Incompleto" que, ao toque, mostra o que falta e leva direto
 * à aba certa do cadastro — sem caçar campo por campo.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CampoEssencial } from "@/lib/dp/cadastro-completude";

export type AbaPendencia = "dados" | "remuneracao";

const ABA_DO_CAMPO: Record<string, AbaPendencia> = {
  salario_base: "remuneracao",
  dados_pagamento: "remuneracao",
};

export const abaDoCampo = (chave: string): AbaPendencia => ABA_DO_CAMPO[chave] ?? "dados";

const ROTULO_ABA: Record<AbaPendencia, string> = { dados: "Dados", remuneracao: "Remuneração" };

export function CadastroIncompletoBadge({
  faltando,
  onCompletar,
  className = "text-[11px]",
}: {
  faltando: CampoEssencial[];
  onCompletar: (aba: AbaPendencia) => void;
  className?: string;
}) {
  if (!faltando.length) return null;
  const abas = Array.from(new Set(faltando.map((f) => abaDoCampo(f.chave))));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Cadastro incompleto: ver ${faltando.length} pendência(s)`}
        >
          <Badge
            variant="outline"
            className={`${className} cursor-pointer border-amber-500/40 text-amber-600 dark:text-amber-400`}
          >
            Cadastro incompleto ({faltando.length})
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" onClick={(e) => e.stopPropagation()}>
        <p className="mb-2 text-sm font-medium">O que Falta</p>
        <ul className="mb-3 space-y-1 text-sm">
          {faltando.map((f) => (
            <li key={f.chave} className="flex items-center justify-between gap-2">
              <span className="first-letter:uppercase">{f.label}</span>
              <span className="text-[11px] text-muted-foreground">{ROTULO_ABA[abaDoCampo(f.chave)]}</span>
            </li>
          ))}
        </ul>
        <div className="grid gap-2">
          {abas.map((a) => (
            <Button key={a} size="sm" variant={a === abas[0] ? "default" : "outline"} onClick={() => onCompletar(a)}>
              Completar em {ROTULO_ABA[a]}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
