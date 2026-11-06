import { useState } from "react";
import { Banknote, UserPlus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDpDesligamentosAgenda } from "@/hooks/useDpDesligamentosAgenda";
import { useDpIniciosCalendario } from "@/hooks/useDpIniciosCalendario";
import { rescisoesPeriodo } from "@/lib/dp/rescisao-calendario";
import { IniciosTrabalho } from "./IniciosTrabalho";
import { PrazosRescisao } from "./PrazosRescisao";
import { PagamentosDoDia } from "./PagamentosDia";
import { useDpPagamentosMarcos } from "@/hooks/useDpPagamentosMarcos";

const CHIP = "flex h-11 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border bg-card px-1.5 py-1 text-xs shadow-sm hover:bg-muted md:h-7 md:w-auto md:shrink-0 md:flex-row md:gap-1.5 md:rounded-full md:px-2.5";

type ChaveMarco = "inicios" | "rescisao" | "pagamentos";
export const rotuloMarco = (chave: ChaveMarco, total: number, escopo: "dia" | "mes") => {
  const base = chave === "inicios" ? (total === 1 ? "Admissão" : "Admissões") : chave === "rescisao" ? (total === 1 ? "Rescisão" : "Rescisões") : (total === 1 ? "Pagamento" : "Pagamentos");
  return `${base} ${escopo === "dia" ? "do dia" : "no mês"}`;
};

/** Com `data`, conta só marcos daquele dia e some quando não há nenhum; sem `data`, resume a competência. */
export function MarcosPessoasChips({ competencia, data, unidadeId }: { competencia: string; data?: string; unidadeId?: string | null }) {
  const [aberto, setAberto] = useState<ChaveMarco | null>(null);
  const agenda = useDpDesligamentosAgenda();
  const inicios = useDpIniciosCalendario(data ? data.slice(0, 7) : competencia);
  const eventos = (inicios.data ?? []).filter((e) => (!unidadeId || e.unidadeId === unidadeId) && (!data || e.data === data));
  const processos = rescisoesPeriodo(agenda.data ?? [], data ?? competencia, unidadeId);
  const pagamentos = useDpPagamentosMarcos(data ? data.slice(0, 7) : competencia, unidadeId);
  const marcosPagamento = data ? pagamentos.porData.get(data) ?? [] : pagamentos.marcos;
  const datasPagamento = [...new Set(marcosPagamento.map((m) => m.data))].sort();
  const datas = [...new Set(eventos.map((e) => e.data))].sort();
  const escopo = data ? "dia" : "mes";
  const itens = [
    { chave: "inicios" as const, Icon: UserPlus, total: eventos.length, query: inicios },
    { chave: "rescisao" as const, Icon: Wallet, total: processos.length, query: agenda },
    { chave: "pagamentos" as const, Icon: Banknote, total: marcosPagamento.length, query: pagamentos },
  ];
  const descricao = data
    ? new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })
    : new Date(`${competencia}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const visiveis = itens.filter((i) => i.total > 0 || (!data && (i.query.isLoading || i.query.isError)) || (data && i.query.isError));
  return <>
    {visiveis.map(({ chave, Icon, total, query }) => {
      const label = rotuloMarco(chave, total, escopo);
      return <Button key={chave} variant="ghost" className={CHIP} onClick={() => setAberto(chave)} aria-label={`Ver ${label}: ${query.isError ? "consulta indisponível" : total}`}>
        <span className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="font-bold tabular-nums">{query.isLoading ? "…" : query.isError ? "—" : total}</span></span>
        <span className="text-[11px] text-muted-foreground md:text-xs">{label}</span>
      </Button>;
    })}
    <Dialog open={aberto !== null} onOpenChange={(o) => { if (!o) setAberto(null); }}>
      <DialogContent className="flex max-h-[85dvh] max-w-lg flex-col">
        <DialogHeader><DialogTitle>{aberto === "inicios" ? "Admissões" : aberto === "pagamentos" ? "Previsão de pagamentos" : "Rescisões"}</DialogTitle><DialogDescription className="first-letter:uppercase">{descricao}</DialogDescription></DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto">
          {aberto === "pagamentos" ? <>
            {pagamentos.isError && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">Não foi possível consultar as previsões de pagamento.</p><Button variant="outline" onClick={() => pagamentos.refetch()}>Tentar novamente</Button></div>}
            {datasPagamento.map((d) => <div key={d} className="space-y-2">{!data && <p className="text-sm font-semibold first-letter:uppercase">{new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</p>}<PagamentosDoDia marcos={marcosPagamento.filter((m) => m.data === d)} /></div>)}
            <p className="text-xs text-muted-foreground">Datas previstas pela regra cadastrada na unidade (Cadastros › Unidades). O colaborador vê só o que vale para ele.</p>
          </> : aberto === "rescisao" ? <PrazosRescisao data={data} competencia={data ? undefined : competencia} unidadeId={unidadeId} /> : <>
            {inicios.isLoading && <p role="status" className="text-sm text-muted-foreground">Carregando admissões…</p>}
            {inicios.isError && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">Não foi possível consultar as admissões.</p><Button variant="outline" onClick={() => inicios.refetch()}>Tentar novamente</Button></div>}
            {datas.map((d) => <div key={d} className="space-y-2">{!data && <p className="text-sm font-semibold">{new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</p>}<IniciosTrabalho data={d} unidadeId={unidadeId ?? null} /></div>)}
          </>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
