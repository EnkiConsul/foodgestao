import { Link } from "react-router-dom";
import { CalendarClock, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExtratoAviso } from "@/components/dp/ExtratoAviso";
import type { DesligamentoAgenda } from "@/hooks/useDpDesligamentosAgenda";
import { caminhoDesligamento } from "@/lib/dp/desligamento-apresentacao";

const br = (v: string | null) => v ? v.split("-").reverse().join("/") : "—";
export function DesligamentoResumo({ processo }: { processo: DesligamentoAgenda }) {
  return <section className="space-y-3 border-b border-border pb-4" aria-label="Aviso prévio em andamento">
    <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" />Aviso prévio em andamento</h3>
    <dl className="grid grid-cols-2 gap-3 text-sm">
      {[["Comunicação", processo.data_comunicacao], ["Início da contagem", processo.inicio_aviso], ["Último dia na loja", processo.ultimo_comparecimento], ["Término do contrato", processo.data_efetiva], ["Prazo da rescisão", processo.prazo_10_dias]].map(([label, data]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-semibold">{br(data)}</dd></div>)}
    </dl>
    <p className="text-xs text-muted-foreground">Pagamento e documentos rescisórios: até 10 dias corridos após o término do contrato (Art. 477, §6º, CLT).</p>
    <ExtratoAviso extrato={processo.extrato_aviso} comunicacao={processo.data_comunicacao} ultimo={processo.ultimo_comparecimento} />
    <Button asChild variant="outline" size="sm"><Link to={caminhoDesligamento(processo.colaborador_id)}>Rever datas do desligamento<ChevronRight className="ml-2 h-4 w-4" /></Link></Button>
  </section>;
}