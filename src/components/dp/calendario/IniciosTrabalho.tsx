import { UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useDpIniciosCalendario } from "@/hooks/useDpIniciosCalendario";

const ROTULO = { formal: "Admissão", prevista: "Admissão prevista", provisorio: "Início na rotina · Aguardando admissão", operacional: "Início de trabalho" };

export function IniciosTrabalho({ data, unidadeId }: { data: string; unidadeId: string | null }) {
  const query = useDpIniciosCalendario(data.slice(0, 7));
  const eventos = (query.data ?? []).filter((e) => e.data === data && (!unidadeId || e.unidadeId === unidadeId));
  if (query.isLoading) return <p role="status" className="text-xs text-muted-foreground">Carregando inícios de trabalho…</p>;
  if (query.isError) return <div className="flex flex-wrap items-center gap-2"><p className="text-xs text-muted-foreground">Não foi possível consultar as admissões.</p><Button variant="outline" size="sm" onClick={() => query.refetch()}>Tentar novamente</Button></div>;
  if (!eventos.length) return null;
  return <section className="space-y-2" aria-label="Inícios de trabalho do dia">
    <h3 className="flex items-center gap-2 text-sm font-semibold"><UserPlus className="h-4 w-4 text-primary" />Inícios de trabalho do dia</h3>
    {eventos.map((e) => <div key={e.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{e.nome}</p><p className="text-xs text-muted-foreground">{ROTULO[e.tipo]}</p></div>
      {(e.preadmissaoId || e.colaboradorId) && <Button asChild variant="outline" size="sm" className="min-h-11 shrink-0"><Link to={e.preadmissaoId ? `/dp/colaboradores/pre-admissoes?preadmissao=${e.preadmissaoId}` : `/dp/colaboradores?editar=${e.colaboradorId}`}>Ver {e.preadmissaoId ? "admissão" : "ficha"}</Link></Button>}
    </div>)}
  </section>;
}