import { useState } from "react";
import { Link } from "react-router-dom";
import { Cake, ChevronRight, Clock, MessageCircle, MessageSquare } from "lucide-react";
import { DpDialogShell } from "@/components/dp/DpDialogShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDpAniversariantes30d, type AnivItem } from "@/hooks/useDpAniversariantes30d";
import { WhatsappComposerDialog } from "@/components/dp/WhatsappComposerDialog";
import { cn } from "@/lib/utils";
import { toUpperCadastro } from "@/lib/text/upperCadastro";
import { filtrarAniversariantesPortal } from "@/lib/dp/aniversariantes-portal";
import { useMeuVinculoPortal } from "@/hooks/useMeuVinculoPortal";

export function AniversariantesCard({ variant = "admin", compacto = false, emFaixa = false, competencia, dataDia, unidadeId }: { variant?: "admin" | "portal"; compacto?: boolean; emFaixa?: boolean; competencia?: string; dataDia?: string; unidadeId?: string | null }) {
  const { data: todos = [], isLoading, isError, refetch } = useDpAniversariantes30d(competencia);
  const { data: eu } = useMeuVinculoPortal();
  const [aberto, setAberto] = useState(false);
  const [target, setTarget] = useState<AnivItem | null>(null);
  const portal = variant === "portal";
  const visiveis = portal
    ? filtrarAniversariantesPortal(todos, {
        colaboradorId: eu?.colaboradorId ?? null,
        unidadeId: eu?.unidadeId ?? null,
      })
    : todos;
  const data = visiveis.filter((a) => (!unidadeId || a.unidadeId === unidadeId) && (!dataDia || `${a.data.getFullYear()}-${String(a.data.getMonth() + 1).padStart(2, "0")}-${String(a.data.getDate()).padStart(2, "0")}` === dataDia));
  if (dataDia && !isLoading && !isError && !data.length) return null;
  const lista = <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {isLoading && <p role="status" className="py-4 text-sm text-muted-foreground">Carregando aniversariantes…</p>}
        {isError && <div className="space-y-2"><p className="text-sm text-muted-foreground">Não foi possível carregar os aniversariantes.</p><Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button></div>}
        {!isLoading && !isError && data.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nenhum aniversariante {dataDia ? "neste dia" : competencia ? "neste mês" : "nos próximos 30 dias"}.</p>}
        {data.map((a) => (
          <div key={a.id} className="flex items-start gap-3 rounded-xl bg-card border border-border p-3">
            <div className={cn("h-11 w-11 rounded-full flex flex-col items-center justify-center shrink-0 text-[10px] font-semibold leading-none", a.tipo === "nascimento" ? "bg-[hsl(var(--dp-birthday-nasc))]" : "bg-[hsl(var(--dp-birthday-contrat))]")}><span className="text-sm">{a.diaMes.slice(0, 2)}</span><span className="opacity-70">{a.diaMes.slice(3)}</span></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium break-words leading-snug">{toUpperCadastro(a.nome)}</p>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-1"><Badge variant="outline" className="text-[10px]">{a.tipo === "nascimento" ? "Nascimento" : "Contratação"}</Badge><span className="text-[11px] text-muted-foreground">{a.tipo === "nascimento" ? `${a.faltamDias < 0 ? "Completou" : "Completa"} ${a.anosCompletos} anos` : `${a.anosCompletos} ${a.anosCompletos === 1 ? "ano" : "anos"} de casa`}</span></div>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-1"><span className="text-[11px] text-muted-foreground break-words">{a.unidade ? `🏢 ${a.unidade}` : ""}</span><span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Clock className="h-3 w-3" />{a.faltamDias === 0 ? "Hoje 🎉" : a.faltamDias < 0 ? `Há ${-a.faltamDias} ${a.faltamDias === -1 ? "dia" : "dias"}` : `Faltam ${a.faltamDias} ${a.faltamDias === 1 ? "dia" : "dias"}`}</span></div>
              {!portal && <div className="flex items-center justify-end gap-1.5 mt-2"><Button size="sm" variant="outline" className="min-h-9 text-xs flex-1" onClick={() => setTarget(a)}><MessageSquare className="h-3 w-3 mr-1" />WhatsApp</Button><Button asChild size="sm" variant="outline" className="min-h-9 text-xs flex-1"><Link to={`/dp/mensagens?to=${a.colaboradorId}`}><MessageCircle className="h-3 w-3 mr-1" />Comunicado</Link></Button></div>}
            </div>
          </div>
        ))}
      </div>;

  return (
    <>
    {compacto ? <>
      <Button variant="outline" onClick={() => setAberto(true)} className={cn("h-auto min-w-0 w-full justify-start rounded-2xl bg-card text-left", emFaixa ? "min-h-11 gap-1 px-2 py-2 sm:gap-2 sm:px-3" : "grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5 gap-y-1 px-2.5 py-3 sm:flex sm:gap-3 sm:px-4")} aria-label="Ver aniversariantes">
        <span className={cn("shrink-0 items-center justify-center rounded-lg bg-calendar-dominical/15 text-calendar-dominical", emFaixa ? "hidden h-7 w-7 sm:flex" : "hidden h-9 w-9 sm:flex")}><Cake className="h-4 w-4" /></span>
        <span className={cn("min-w-0 flex-1 whitespace-normal", !emFaixa && "contents sm:block")}>
          <strong className={cn("block font-semibold", emFaixa ? "break-words text-[10px] leading-tight sm:text-xs" : "text-xs leading-snug sm:text-sm")}>Aniversariantes</strong>
          {!emFaixa && <span className="col-span-2 row-start-2 block whitespace-normal break-words text-[11px] leading-snug text-muted-foreground sm:text-xs">{competencia ? "Neste mês" : "Nos próximos 30 dias"}</span>}
        </span>
        <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-calendar-dominical/15 px-1.5 text-xs font-bold tabular-nums text-calendar-dominical">{isLoading ? "…" : isError ? "—" : data.length}</span>
        {!emFaixa && <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />}
      </Button>
      <DpDialogShell open={aberto} onOpenChange={setAberto} icon={Cake} title="Aniversariantes" description={competencia ? "Nascimento e tempo de casa neste mês" : "Nascimento e tempo de casa nos próximos 30 dias"} footer={<Button variant="outline" onClick={() => setAberto(false)}>Fechar</Button>}>{lista}</DpDialogShell>
    </> : <div className={cn("min-w-0", competencia ? "space-y-3" : "rounded-2xl border-2 border-[hsl(var(--dp-birthday-border))] bg-[hsl(var(--dp-birthday-bg))] p-5")}>
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
           : dataDia ? "Nascimento e tempo de casa neste dia" : competencia ? "Nascimento e tempo de casa neste mês" : "Aniversários de nascimento e de contratação nos próximos 30 dias"}
      </p>

      {lista}
    </div>}

      <WhatsappComposerDialog
        open={!!target}
        onClose={() => setTarget(null)}
        colaboradorId={target?.colaboradorId ?? null}
        nome={target?.nome ?? ""}
        tiposModelo={target ? [target.tipo === "nascimento" ? "aniversario" : "tempo_casa"] : undefined}
        contexto={{
          tipo: target?.tipo === "nascimento" ? "aniversário" : "contratação",
          anos: String(target?.anosCompletos ?? ""),
          nome: target?.nome ?? "",
        }}
      />
    </>
  );
}
