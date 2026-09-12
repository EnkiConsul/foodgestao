import { useState } from "react";
import { Link } from "react-router-dom";
import { Cake, MessageCircle, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDpAniversariantes30d, type AnivItem } from "@/hooks/useDpAniversariantes30d";
import { WhatsappComposerDialog } from "@/components/dp/WhatsappComposerDialog";
import { cn } from "@/lib/utils";
import { toUpperCadastro } from "@/lib/text/upperCadastro";
import { filtrarAniversariantesPortal } from "@/lib/dp/aniversariantes-portal";
import { useMeuVinculoPortal } from "@/hooks/useMeuVinculoPortal";

export function AniversariantesCard({ variant = "admin" }: { variant?: "admin" | "portal" }) {
  const { data: todos = [] } = useDpAniversariantes30d();
  const { data: eu } = useMeuVinculoPortal();
  const [target, setTarget] = useState<AnivItem | null>(null);
  const portal = variant === "portal";
  const data = portal
    ? filtrarAniversariantesPortal(todos, {
        colaboradorId: eu?.colaboradorId ?? null,
        unidadeId: eu?.unidadeId ?? null,
      })
    : todos;

  return (
    <div className="rounded-2xl border-2 border-[hsl(var(--dp-birthday-border))] bg-[hsl(var(--dp-birthday-bg))] p-5">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <Cake className="h-5 w-5 text-primary shrink-0" />
        <h2 className="text-base sm:text-lg font-semibold min-w-0 break-words">Aniversariantes</h2>
        <Badge className="ml-1 bg-primary text-primary-foreground rounded-full h-6 min-w-6 px-2 shrink-0">
          {data.length}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {portal
          ? "Colegas da sua unidade e seu tempo de casa"
          : "Aniversários de nascimento e de contratação nos próximos 30 dias"}
      </p>

      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {data.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhum aniversariante nos próximos 30 dias.</p>
        )}
        {data.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-3 rounded-xl bg-card border border-[hsl(var(--dp-border))] p-3"
          >
            <div
              className={cn(
                "h-11 w-11 rounded-full flex flex-col items-center justify-center shrink-0 text-[10px] font-semibold leading-none",
                a.tipo === "nascimento"
                  ? "bg-[hsl(var(--dp-birthday-nasc))]"
                  : "bg-[hsl(var(--dp-birthday-contrat))]",
              )}
            >
              <span className="text-sm">{a.diaMes.slice(0, 2)}</span>
              <span className="opacity-70">{a.diaMes.slice(3)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium break-words leading-snug">{toUpperCadastro(a.nome)}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] capitalize border-0",
                    a.tipo === "nascimento"
                      ? "bg-[hsl(var(--dp-birthday-nasc))] text-foreground"
                      : "bg-[hsl(var(--dp-birthday-contrat))] text-foreground",
                  )}
                >
                  {a.tipo === "nascimento" ? "Nascimento" : "Contratação"}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  {a.tipo === "nascimento"
                    ? `Completa ${a.anosCompletos} anos`
                    : `${a.anosCompletos} ${a.anosCompletos === 1 ? "ano" : "anos"} de casa`}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {a.faltamDias === 0 ? "Hoje 🎉" : `Faltam ${a.faltamDias} ${a.faltamDias === 1 ? "dia" : "dias"}`}
                </span>
              </div>
              {a.unidade && (
                <p className="text-[11px] text-muted-foreground mt-0.5">🏢 {a.unidade}</p>
              )}
            </div>
            {!portal && (
            <div className="flex flex-col gap-1 shrink-0">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setTarget(a)}>
                <MessageSquare className="h-3 w-3 mr-1" />
                WhatsApp
              </Button>
              <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                <Link to={`/dp/mensagens?to=${a.colaboradorId}`}>
                  <MessageCircle className="h-3 w-3 mr-1" />
                  Mensagem
                </Link>
              </Button>
            </div>
            )}
          </div>
        ))}
      </div>

      <WhatsappComposerDialog
        open={!!target}
        onClose={() => setTarget(null)}
        colaboradorId={target?.colaboradorId ?? null}
        nome={target?.nome ?? ""}
        contexto={{
          tipo: target?.tipo === "nascimento" ? "aniversário" : "contratação",
          anos: String(target?.anosCompletos ?? ""),
          nome: target?.nome ?? "",
        }}
      />
    </div>
  );
}
