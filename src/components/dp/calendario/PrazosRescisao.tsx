import { Link } from "react-router-dom";
import { Wallet, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDpDesligamentosAgenda } from "@/hooks/useDpDesligamentosAgenda";
import { caminhoDesligamento, situacaoPagamento, diasAtePrazo } from "@/lib/dp/desligamento-apresentacao";
import { hojeIsoLocal } from "@/lib/dp/dataLocal";
import { rescisoesPeriodo } from "@/lib/dp/rescisao-calendario";

export function PrazosRescisao({ data, competencia, unidadeId }: { data?: string; competencia?: string; unidadeId?: string | null }) {
  const q = useDpDesligamentosAgenda();
  const processos = rescisoesPeriodo(q.data ?? [], data ?? competencia ?? "", unidadeId);
  if (q.isLoading) return <p role="status" className="text-xs text-muted-foreground">Carregando rescisões…</p>;
  if (q.isError) return <p role="alert" className="text-xs text-destructive">Não foi possível consultar os prazos rescisórios.</p>;
  if (!processos.length) return null;
  return <section className="space-y-2" aria-label="Marcos de rescisão">
    <h3 className="flex items-center gap-2 text-sm font-semibold"><Wallet className="h-4 w-4 text-primary" />Rescisão{data ? " do dia" : ""}</h3>
    <p className="text-xs text-muted-foreground">10 dias corridos após o término do contrato · Art. 477, §6º, CLT.</p>
    {processos.map((p) => <div key={p.id} className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><span className="min-w-0 break-words text-sm font-semibold">{p.colaborador?.nome ?? "Colaborador"}</span><Badge variant="outline" className={p.pagamento_status === "pago" ? "text-primary border-primary/40" : diasAtePrazo(p.prazo_10_dias, hojeIsoLocal()) <= 0 ? "text-destructive border-destructive/40" : diasAtePrazo(p.prazo_10_dias, hojeIsoLocal()) <= 3 ? "text-warning border-warning/40" : "text-muted-foreground"}>{situacaoPagamento(p, hojeIsoLocal())}</Badge></div>
      <dl className="mt-2 space-y-1 text-xs">
        {[
          { label: "Último dia de trabalho", valor: p.ultimo_comparecimento },
          { label: "Fim do contrato", valor: p.data_efetiva },
          { label: "Último dia para pagamento", valor: p.prazo_10_dias },
        ].map((m) => <div key={m.label} className={m.valor === data ? "rounded border border-primary/30 bg-primary/5 px-2 py-1 font-semibold text-primary" : "text-muted-foreground"}>
          <dt className="inline">{m.label}: </dt><dd className="inline font-semibold">{m.valor ? m.valor.split("-").reverse().join("/") : "Não informado"}</dd>
        </div>)}
      </dl>
      {p.pagamento_status !== "pago" && diasAtePrazo(p.prazo_10_dias, hojeIsoLocal()) > 0 && <p className="text-xs text-muted-foreground">Faltam {diasAtePrazo(p.prazo_10_dias, hojeIsoLocal())} dias</p>}
      {p.pagamento_status === "pago" && p.pagamento_em && <p className="text-xs text-muted-foreground">Pago em {p.pagamento_em.split("-").reverse().join("/")}</p>}
      <Button asChild size="sm" variant="ghost" className="mt-2 h-auto min-h-9 px-0"><Link to={caminhoDesligamento(p.colaborador_id)}>Rever desligamento<ChevronRight className="ml-1 h-4 w-4" /></Link></Button>
    </div>)}
  </section>;
}