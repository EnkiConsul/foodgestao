import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { MinhaOcorrenciaCard } from "@/components/dp/ocorrencias/MinhaOcorrenciaCard";
import { useMinhasOcorrenciasPeriodo } from "@/hooks/useMinhasOcorrenciasPeriodo";
import { useMinhasOcorrencias } from "@/hooks/useMinhasOcorrencias";
import { aguardandoAnalise, resumoAssiduidadePortal } from "@/lib/dp/minhas-ocorrencias";
import { premioAssiduidadeAplicavel } from "@/lib/dp/assiduidade-risco";

export default function DpMinhasOcorrencias() {
  const [params, setParams] = useSearchParams();
  const competencia = params.get("mes");
  const parsed = competencia && /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia) ? new Date(`${competencia}-01T12:00:00`) : new Date();
  const mes = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const inicio = format(startOfMonth(mes), "yyyy-MM-dd");
  const fim = format(endOfMonth(mes), "yyyy-MM-dd");
  const query = useMinhasOcorrenciasPeriodo(inicio, fim);
  const { regraAssiduidade } = useMinhasOcorrencias();
  const [filtro, setFiltro] = useState("todas");
  const [quantidade, setQuantidade] = useState(30);
  const itens = query.data ?? [];
  const ativos = itens.filter(o => o.estado !== "cancelada");
  const lista = itens.filter(o => filtro === "canceladas" ? o.estado === "cancelada" : o.estado !== "cancelada" && (filtro === "todas" || (filtro === "pendentes" ? aguardandoAnalise(o) : !aguardandoAnalise(o))));
  const mudarMes = (passo: number) => { setParams({ mes: format(addMonths(mes, passo), "yyyy-MM") }); setQuantidade(30); };
  return <DpPage narrow>
    <Helmet><title>Minhas Ocorrências | AVETO 360</title></Helmet>
    <DpPageHeader title="Minhas Ocorrências" icon={ClipboardList} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Mês anterior" title="Mês anterior" onClick={() => mudarMes(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="min-w-40 text-center font-medium">{format(mes, "MMMM 'de' yyyy", { locale: ptBR })}</span>
        <Button variant="outline" size="icon" aria-label="Próximo mês" title="Próximo mês" onClick={() => mudarMes(1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <Select value={filtro} onValueChange={v => { setFiltro(v); setQuantidade(30); }}><SelectTrigger className="w-full sm:w-56" aria-label="Situação das ocorrências"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="todas">Todas ({ativos.length})</SelectItem><SelectItem value="pendentes">Aguardando análise</SelectItem><SelectItem value="analisadas">Analisadas</SelectItem><SelectItem value="canceladas">Canceladas ({itens.length - ativos.length})</SelectItem>
      </SelectContent></Select>
    </div>
    {query.isLoading ? <p role="status">Carregando ocorrências…</p> : query.isError ? <div role="alert" className="space-y-2"><p>Não foi possível consultar suas ocorrências.</p><Button variant="outline" onClick={() => query.refetch()}>Tentar novamente</Button></div> : <>
      {premioAssiduidadeAplicavel(regraAssiduidade) && <section className="border-y border-border py-3 space-y-1"><h2 className="font-semibold">Prêmio de assiduidade</h2><p className="text-sm">{resumoAssiduidadePortal(ativos)}</p><p className="text-xs text-muted-foreground">Acompanhamento das decisões registradas; não representa apuração ou garantia de pagamento.</p></section>}
      {lista.length === 0 ? <p className="py-8 text-center text-muted-foreground">Nenhuma ocorrência neste período e situação.</p> : <div className="space-y-3">{lista.slice(0, quantidade).map(o => <MinhaOcorrenciaCard key={o.id} ocorrencia={o} destaque={params.get("data") === o.data_operacional} />)}</div>}
      {lista.length > quantidade && <Button variant="outline" onClick={() => setQuantidade(q => q + 30)}>Ver mais</Button>}
    </>}
    <Button variant="outline" asChild><Link to={`/dp/meu/calendario?mes=${format(mes, "yyyy-MM")}`}><CalendarDays className="mr-2 h-4 w-4" />Meu Calendário</Link></Button>
  </DpPage>;
}