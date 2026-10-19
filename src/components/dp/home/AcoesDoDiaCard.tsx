import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronRight, ListChecks, Loader2, X } from "lucide-react";
import { useDpPendencias } from "@/hooks/useDpPendencias";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { useDpPendenciasDecisoes } from "@/hooks/useDpPendenciasDecisoes";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { compararUrgencia, filtrarAbertas, urgenciaDe } from "@/lib/dp/pendencias";
import { useStablePendencias, UrgenciaBadge } from "@/components/dp/home/PendenciasCard";
import { PendenciaAcoes } from "@/components/dp/pendencias/PendenciaAcoes";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

const dataBR = (d: string) => new Date(d.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR");

/**
 * Resumo das "Ações do Dia" na tela inicial. O toque abre as pendências numa
 * gaveta na própria tela, com as ações de resolução; a tela completa fica
 * como link no rodapé.
 */
export function AcoesDoDiaCard({ emFaixa = false }: { emFaixa?: boolean }) {
  const { selectedCompanyId } = useCompanyContext();
  const { data, isLoading, isFetching, isError, refetch, dataUpdatedAt, lastCalculatedAt } = useDpPendencias();
  const stable = useStablePendencias({ companyId: selectedCompanyId, data, dataUpdatedAt, lastCalculatedAt, isLoading, isFetching });
  const { prefs } = useDpUserPrefs();
  const { ignoradas, adiadas } = useDpPendenciasDecisoes();
  const isMobile = useIsMobile();
  const [aberto, setAberto] = useState(false);

  const abertas = useMemo(
    () => filtrarAbertas(stable.data.filter((p) => !ignoradas.has(p.id)), { ...prefs.pendencias_adiadas, ...adiadas })
      .slice().sort(compararUrgencia),
    [stable.data, prefs.pendencias_adiadas, ignoradas, adiadas],
  );
  const atrasadas = abertas.filter((p) => urgenciaDe(p) === "atrasada").length;
  const hoje = abertas.filter((p) => urgenciaDe(p) === "hoje").length;
  const carregando = !stable.ready && !isError;
  const falhou = isError;

  const resumo = falhou && !stable.ready
    ? "Falha ao carregar"
    : carregando
    ? "Carregando…"
    : abertas.length === 0
      ? "Tudo em dia"
      : [atrasadas > 0 && `${atrasadas} ${atrasadas === 1 ? "atrasada" : "atrasadas"}`, hoje > 0 && `${hoje} para hoje`]
          .filter(Boolean)
          .join(" · ") || "Nenhuma urgente";

  const conteudo = (
    <div className="space-y-3">
      {falhou && (
        <DpErrorState
          message={stable.ready ? "A lista abaixo é da última consulta confirmada. Tente novamente." : "Não foi possível carregar as ações. Tente novamente."}
          onRetry={() => void refetch()}
        />
      )}
      {carregando && (
        <div role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando ações…
        </div>
      )}
      {stable.ready && abertas.length === 0 && !falhou && (
        <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden="true" />
          <p className="text-base font-semibold">Tudo em dia!</p>
          <p className="text-sm text-muted-foreground">Nenhuma ação pendente agora.</p>
        </div>
      )}
      {abertas.length > 0 && (
        <ul className="space-y-2">
          {abertas.map((p) => {
            const u = urgenciaDe(p);
            return (
              <li key={p.id} className="relative flex gap-3 overflow-hidden rounded-2xl border border-border bg-card p-3 pl-4">
                <span
                  className={cn("absolute inset-y-0 left-0 w-1", u === "atrasada" || u === "urgente" ? "bg-destructive" : u === "hoje" ? "bg-warning" : "bg-border")}
                  aria-hidden="true"
                />
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <p.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-semibold leading-snug">{p.titulo}</p>
                    <UrgenciaBadge atrasoDias={p.atrasoDias} urgente={p.urgente} />
                  </div>
                  <p className="break-words text-xs leading-relaxed text-muted-foreground">{p.subtitulo}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-0.5">{p.tipo}</span>
                    {(p.colaboradorNome ?? p.unidadeNome) && <span className="truncate">{p.colaboradorNome ?? p.unidadeNome}</span>}
                    {p.vencimento && <span>Prazo {dataBR(p.vencimento)}</span>}
                  </div>
                  <PendenciaAcoes pendencia={p} onNavigate={() => setAberto(false)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Button asChild variant="outline" className="w-full">
        <Link to="/dp/cadastros/pendencias" onClick={() => setAberto(false)}>
          Abrir tela completa <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );

  const descricao = abertas.length > 0
    ? `${abertas.length} ${abertas.length === 1 ? "ação aberta" : "ações abertas"}${atrasadas > 0 ? ` · ${atrasadas} atrasada${atrasadas > 1 ? "s" : ""}` : ""}`
    : "Resolva aqui mesmo, sem sair do início.";

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setAberto(true)}
        className={cn("h-auto min-w-0 w-full justify-start rounded-2xl border bg-card text-left hover:bg-muted/40", emFaixa ? "min-h-11 gap-2 px-2 py-2 sm:px-3" : "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5 gap-y-1 px-2.5 py-3 sm:flex sm:gap-3 sm:px-4")}
        aria-label="Abrir Ações do Dia"
      >
        <span className={cn("shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary", emFaixa ? "hidden h-7 w-7 sm:flex" : "hidden h-9 w-9 sm:flex")}>
          <ListChecks className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className={cn("min-w-0 flex-1", !emFaixa && "contents sm:block")}>
          <p className={cn("whitespace-normal font-semibold", emFaixa ? "text-[11px] leading-tight sm:text-xs" : "text-xs leading-snug sm:text-sm")}>Ações do Dia</p>
          {!emFaixa && <p className={cn("col-span-2 row-start-2 whitespace-normal break-words text-[11px] leading-snug sm:text-xs", atrasadas > 0 || (falhou && !stable.ready) ? "text-destructive" : "text-muted-foreground")}>{resumo}</p>}
        </div>
        {!carregando && abertas.length > 0 && (
          <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold tabular-nums text-primary-foreground">{abertas.length}</span>
        )}
        {emFaixa && (carregando || falhou) && <span className="text-xs text-muted-foreground" title={resumo}>{carregando ? "…" : "!"}</span>}
        {!emFaixa && <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />}
      </Button>

      {isMobile ? (
        <Drawer open={aberto} onOpenChange={setAberto}>
          <DrawerContent className="max-h-[90dvh]">
            <DrawerHeader className="relative text-left">
              <DrawerTitle>Ações do Dia</DrawerTitle>
              <DrawerDescription>{descricao}</DrawerDescription>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="absolute right-2 top-0" aria-label="Fechar">
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DrawerClose>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6">{conteudo}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={aberto} onOpenChange={setAberto}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Ações do Dia</DialogTitle>
              <DialogDescription>{descricao}</DialogDescription>
            </DialogHeader>
            {conteudo}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
