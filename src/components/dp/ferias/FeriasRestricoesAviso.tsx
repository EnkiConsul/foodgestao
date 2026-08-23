import { Link } from "react-router-dom";
import { CalendarOff, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DpContentCard } from "@/components/dp/DpPage";
import { useDpFeriasRegras } from "@/hooks/useDpFeriasRegras";

const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** Resumo das restrições vigentes de férias (limites simultâneos e períodos bloqueados). */
export function FeriasRestricoesAviso() {
  const { regras, bloqueios } = useDpFeriasRegras();
  const ativos = bloqueios.filter((b) => b.ativo);
  const regrasAtivas = regras.filter((r) => r.ativo);

  if (ativos.length === 0 && regrasAtivas.length === 0) return null;

  return (
    <DpContentCard contentClassName="flex flex-wrap items-center gap-2 p-3 text-sm">
      {regrasAtivas.length > 0 && (
        <span className="flex items-center gap-1.5">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {regrasAtivas.length} regra(s) de limite simultâneo
        </span>
      )}
      {ativos.length > 0 && (
        <span className="flex flex-wrap items-center gap-1.5">
          <CalendarOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Períodos bloqueados:
          {ativos.slice(0, 4).map((b) => (
            <Badge key={b.id} variant="secondary">
              {b.nome} ({fmt(b.data_inicio)}–{fmt(b.data_fim)})
            </Badge>
          ))}
          {ativos.length > 4 && <Badge variant="outline">+{ativos.length - 4}</Badge>}
        </span>
      )}
      <Button asChild variant="ghost" size="sm" className="ml-auto">
        <Link to="/dp/folgas?aba=regras">Configurar</Link>
      </Button>
    </DpContentCard>
  );
}
