import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDpPontoConformidade } from "@/hooks/useDpPontoConformidade";
import { AVISO_ART74 } from "@/lib/dp/ponto-conformidade";

/** Alerta de unidades com mais de 20 ativos sem ponto e sem justificativa (Art. 74 CLT). */
export function PontoConformidadeAlerta() {
  const { data } = useDpPontoConformidade();
  const irregulares = (data ?? []).filter((u) => u.situacao === "irregular");
  if (!irregulares.length) return null;
  return (
    <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-destructive">
            Atenção Trabalhista (Art. 74 da CLT): {irregulares.length === 1 ? "1 unidade está" : `${irregulares.length} unidades estão`} sem
            registro de ponto
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">{AVISO_ART74}</p>
          <ul className="space-y-1.5">
            {irregulares.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <strong>{u.nome}</strong> — {u.ativos} colaboradores ativos
                </span>
                <Button asChild size="sm" variant="destructive">
                  <Link to={`/dp/cadastros/unidades?editar=${u.id}&aba=dados`}>Regularizar Unidade</Link>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
