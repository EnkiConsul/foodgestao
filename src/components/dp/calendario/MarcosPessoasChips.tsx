import { useState } from "react";
import { UserPlus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDpDesligamentosAgenda } from "@/hooks/useDpDesligamentosAgenda";
import { useDpIniciosCalendario } from "@/hooks/useDpIniciosCalendario";
import { rescisoesPeriodo } from "@/lib/dp/rescisao-calendario";
import { IniciosTrabalho } from "./IniciosTrabalho";
import { PrazosRescisao } from "./PrazosRescisao";

const CHIP = "flex h-11 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border bg-card px-1.5 py-1 text-xs shadow-sm hover:bg-muted md:h-7 md:w-auto md:shrink-0 md:flex-row md:gap-1.5 md:rounded-full md:px-2.5";

export function MarcosPessoasChips({ competencia, unidadeId }: { competencia: string; unidadeId?: string | null }) {
  const [aberto, setAberto] = useState<"inicios" | "rescisao" | null>(null);
  const agenda = useDpDesligamentosAgenda();
  const inicios = useDpIniciosCalendario(competencia);
  const eventos = (inicios.data ?? []).filter((e) => !unidadeId || e.unidadeId === unidadeId);
  const processos = rescisoesPeriodo(agenda.data ?? [], competencia, unidadeId);
  const datas = [...new Set(eventos.map((e) => e.data))].sort();
  const itens = [
    { chave: "inicios" as const, label: "Inícios", Icon: UserPlus, total: eventos.length, query: inicios },
    { chave: "rescisao" as const, label: "Rescisão", Icon: Wallet, total: processos.length, query: agenda },
  ];
  return <>
    {itens.filter((i) => i.total > 0 || i.query.isLoading || i.query.isError).map(({ chave, label, Icon, total, query }) => <Button key={chave} variant="ghost" className={CHIP} onClick={() => setAberto(chave)} aria-label={`Ver ${label}: ${query.isError ? "consulta indisponível" : total}`}>
      <span className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="font-bold tabular-nums">{query.isLoading ? "…" : query.isError ? "—" : total}</span></span>
      <span className="text-[11px] text-muted-foreground md:text-xs">{label}</span>
    </Button>)}
    <Dialog open={aberto !== null} onOpenChange={(o) => { if (!o) setAberto(null); }}>
      <DialogContent className="flex max-h-[85dvh] max-w-lg flex-col">
        <DialogHeader><DialogTitle>{aberto === "inicios" ? "Inícios" : "Rescisão"}</DialogTitle><DialogDescription className="first-letter:uppercase">{new Date(`${competencia}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</DialogDescription></DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto">
          {aberto === "rescisao" ? <PrazosRescisao competencia={competencia} unidadeId={unidadeId} /> : <>
            {inicios.isLoading && <p role="status" className="text-sm text-muted-foreground">Carregando inícios…</p>}
            {inicios.isError && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">Não foi possível consultar os inícios.</p><Button variant="outline" onClick={() => inicios.refetch()}>Tentar novamente</Button></div>}
            {datas.map((data) => <div key={data} className="space-y-2"><p className="text-sm font-semibold">{new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</p><IniciosTrabalho data={data} unidadeId={unidadeId ?? null} /></div>)}
          </>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}