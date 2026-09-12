import { useState } from "react";
import { Link } from "react-router-dom";
import { Cake, Clock, Mail, MessageCircle, MessageSquare } from "lucide-react";
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
        {data.map((a) => {
          const emailTo = a.email?.trim() || null;
          const mailSubject = encodeURIComponent(
            a.tipo === "nascimento" ? "Feliz aniversário!" : "Parabéns pelo tempo de casa!",
          );
          return (
            <div
              key={a.id}
              className="flex items-start gap-3 rounded-xl bg-card border border-[hsl(var(--dp-border))] p-3"
            >
              <div
                className={cn(
                  "h-11 w-11 rounded-full flex flex-col items-center justify-center shrink-0 text-[10px] font-semibold leading-none mt-0.5",
                  a.tipo === "nascimento"
                    ? "bg-[hsl(var(--dp-birthday-nasc))]"
                    : "bg-[hsl(var(--dp-birthday-contrat))]",
                )}
              >
                <span className="text-sm">{a.diaMes.slice(0, 2)}</span>
                <span className="opacity-70">{a.diaMes.slice(3)}</span>
              </div>
              <div className="flex-1 min-w-0">
                {/* Linha 1 — nome na linha inteira */}
                <p className="text-sm font-medium break-words leading-snug">{toUpperCadastro(a.nome)}</p>
                {/* Linha 2 — tipo à esquerda; idade/tempo de casa à direita */}
                <div className="flex items-center justify-between gap-2 mt-1">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] capitalize border-0 shrink-0",
                      a.tipo === "nascimento"
                        ? "bg-[hsl(var(--dp-birthday-nasc))] text-foreground"
                        : "bg-[hsl(var(--dp-birthday-contrat))] text-foreground",
                    )}
                  >
                    {a.tipo === "nascimento" ? "Nascimento" : "Contratação"}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground text-right">
                    {a.tipo === "nascimento"
                      ? `Completa ${a.anosCompletos} anos`
                      : `${a.anosCompletos} ${a.anosCompletos === 1 ? "ano" : "anos"} de casa`}
                  </span>
                </div>
                {/* Linha 3 — unidade à esquerda; dias restantes à direita */}
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-[11px] text-muted-foreground min-w-0 break-words">
                    {a.unidade ? `🏢 ${a.unidade}` : ""}
                  </span>
                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 shrink-0">
                    <Clock className="h-3 w-3" />
                    {a.faltamDias === 0 ? "Hoje 🎉" : `Faltam ${a.faltamDias} ${a.faltamDias === 1 ? "dia" : "dias"}`}
                  </span>
                </div>
                {/* Linha 4 — ações */}
                {!portal && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setTarget(a)}>
                      <MessageSquare className="h-3 w-3 mr-1" />
                      WhatsApp
                    </Button>
                    <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                      <Link to={`/dp/mensagens?to=${a.colaboradorId}`}>
                        <MessageCircle className="h-3 w-3 mr-1" />
                        Comunicado
                      </Link>
                    </Button>
                    {emailTo ? (
                      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                        <a href={`mailto:${emailTo}?subject=${mailSubject}`}>
                          <Mail className="h-3 w-3 mr-1" />
                          E-mail
                        </a>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled
                        title="Sem e-mail cadastrado"
                      >
                        <Mail className="h-3 w-3 mr-1" />
                        E-mail
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
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
