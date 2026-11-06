import { useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDpDesligamentosAgenda } from "@/hooks/useDpDesligamentosAgenda";
import { caminhoDesligamento, situacaoPagamento, diasAtePrazo } from "@/lib/dp/desligamento-apresentacao";
import { hojeIsoLocal } from "@/lib/dp/dataLocal";
import { rescisoesPeriodo } from "@/lib/dp/rescisao-calendario";

export function PrazosRescisao({ data, competencia, unidadeId, compacto = false }: { data?: string; competencia?: string; unidadeId?: string | null; compacto?: boolean }) {
  const q = useDpDesligamentosAgenda();
  const processos = rescisoesPeriodo(q.data ?? [], data ?? competencia ?? "", unidadeId);
  if (q.isLoading) return <p role="status" className="text-xs text-muted-foreground">Carregando rescisões…</p>;
  if (q.isError) return <p role="alert" className="text-xs text-destructive">Não foi possível consultar os prazos rescisórios.</p>;
  if (!processos.length) return null;
  if (compacto) return <RescisoesCompactas processos={processos} data={data} />;
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

function corSituacao(p: any, hoje: string) {
  if (p.pagamento_status === "pago") return "text-primary border-primary/40";
  const d = diasAtePrazo(p.prazo_10_dias, hoje);
  return d <= 0 ? "text-destructive border-destructive/40" : d <= 3 ? "text-warning border-warning/40" : "text-muted-foreground";
}

function RescisoesCompactas({ processos, data }: { processos: any[]; data?: string }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const hoje = hojeIsoLocal();
  const marco = (p: any) => p.prazo_10_dias === data ? "Último dia para pagamento" : p.data_efetiva === data ? "Fim do contrato" : p.ultimo_comparecimento === data ? "Último dia de trabalho" : "Rescisão";
  const fmt = (v?: string | null) => v ? v.split("-").reverse().join("/") : "Não informado";
  return <section className="space-y-1.5" aria-label="Marcos de rescisão">
    {processos.map((p) => {
      const exp = aberto === p.id;
      return <div key={p.id} className="rounded-lg border border-border bg-card">
        <button type="button" aria-expanded={exp} onClick={() => setAberto(exp ? null : p.id)} className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left">
          <Wallet className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.colaborador?.nome ?? "Colaborador"}</span><span className="block truncate text-xs text-muted-foreground">{marco(p)}</span></span>
          <Badge variant="outline" className={`shrink-0 text-[11px] ${corSituacao(p, hoje)}`}>{situacaoPagamento(p, hoje)}</Badge>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${exp ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {exp && <div className="space-y-1 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <p>Último dia de trabalho: <strong>{fmt(p.ultimo_comparecimento)}</strong></p>
          <p>Fim do contrato: <strong>{fmt(p.data_efetiva)}</strong></p>
          <p>Último dia para pagamento: <strong>{fmt(p.prazo_10_dias)}</strong> · Art. 477, §6º, CLT</p>
          <Button asChild size="sm" variant="ghost" className="h-auto min-h-9 px-0"><Link to={caminhoDesligamento(p.colaborador_id)}>Rever desligamento<ChevronRight className="ml-1 h-4 w-4" /></Link></Button>
        </div>}
      </div>;
    })}
  </section>;
}
