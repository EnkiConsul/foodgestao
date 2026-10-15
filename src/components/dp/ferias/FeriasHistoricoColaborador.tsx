import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DpContentCard } from "@/components/dp/DpPage";
import { useDpFeriasSolicitacoes } from "@/hooks/useDpFeriasSolicitacoes";
import type { FeriasGozo, FeriasPeriodo } from "@/hooks/useDpFerias";
import { dataBr as fmt } from "@/lib/dp/formato";

const GOZO_LABEL: Record<string, string> = {
  planejado: "Programada", aprovado: "Aprovada", em_gozo: "Em férias",
  concluido: "Concluída", cancelado: "Cancelada",
};

type Evento = { id: string; data: string; titulo: string; badge: string; linhas: string[]; tom?: "ruim" };

type Props = {
  periodos: FeriasPeriodo[];
  gozos: FeriasGozo[];
  colaboradores: { id: string; nome: string }[];
};

/** Linha do tempo de férias de uma pessoa (somente consulta). */
export function FeriasHistoricoColaborador({ periodos, gozos, colaboradores }: Props) {
  const [colab, setColab] = useState<string>("");
  const { solicitacoes } = useDpFeriasSolicitacoes(["recusada", "cancelada"] as any);

  const eventos = useMemo<Evento[]>(() => {
    if (!colab) return [];
    const out: Evento[] = [];
    for (const g of gozos.filter((x) => x.colaborador_id === colab)) {
      const linhas = [`${fmt(g.data_inicio)} a ${fmt(g.data_fim)} · ${g.dias ?? "—"} dias${g.dias_abono ? ` · abono ${g.dias_abono}` : ""}${g.adiantar_13 ? " · adiantou 13º" : ""}`];
      if (g.aviso_em) linhas.push(`Aviso em ${fmt(g.aviso_em)}${g.ciente_em ? " · ciência registrada" : ""}`);
      if (g.informado_em) linhas.push(`Informada à contabilidade em ${fmt(g.informado_em.slice(0, 10))} (encaminhamento, não confirma lançamento)`);
      if (g.status === "cancelado") linhas.push(`Cancelada${g.cancelado_em ? ` em ${fmt(g.cancelado_em.slice(0, 10))}` : ""}${g.motivo_cancelamento ? ` · motivo: ${g.motivo_cancelamento}` : ""}`);
      out.push({ id: g.id, data: g.data_inicio, titulo: "Férias", badge: GOZO_LABEL[g.status] ?? g.status, linhas, tom: g.status === "cancelado" ? "ruim" : undefined });
    }
    for (const s of solicitacoes.filter((x) => x.colaborador_id === colab)) {
      out.push({
        id: `s-${s.id}`, data: s.data_inicio, titulo: "Pedido do colaborador",
        badge: s.status === "recusada" ? "Recusado" : "Cancelado", tom: "ruim",
        linhas: [`${fmt(s.data_inicio)} a ${fmt(s.data_fim)} · ${s.dias} dias`, ...(s.resposta_admin || s.motivo ? [`Motivo: ${s.resposta_admin || s.motivo}`] : [])],
      });
    }
    return out.sort((a, b) => b.data.localeCompare(a.data));
  }, [colab, gozos, solicitacoes]);

  const meusPeriodos = periodos
    .filter((p) => p.colaborador_id === colab)
    .sort((a, b) => b.inicio_aquisitivo.localeCompare(a.inicio_aquisitivo));

  return (
    <DpContentCard contentClassName="space-y-4 p-4">
      <div className="space-y-1">
        <p className="font-semibold">Histórico por colaborador</p>
        <p className="text-xs text-muted-foreground">Somente consulta: nada aqui altera registros passados.</p>
      </div>
      <Select value={colab} onValueChange={setColab}>
        <SelectTrigger className="w-full sm:w-80"><SelectValue placeholder="Escolha um colaborador" /></SelectTrigger>
        <SelectContent>
          {colaboradores.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
        </SelectContent>
      </Select>

      {colab && (
        <>
          {meusPeriodos.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {meusPeriodos.map((p) => (
                <div key={p.id} className="rounded-lg border border-border p-2 text-xs">
                  <p className="font-medium">{fmt(p.inicio_aquisitivo)} a {fmt(p.fim_aquisitivo)}</p>
                  <p className="text-muted-foreground">
                    Direito {p.dias_direito} · usados {p.dias_gozados ?? 0} · saldo {p.dias_saldo ?? 0}
                  </p>
                </div>
              ))}
            </div>
          )}
          {eventos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem férias ou pedidos registrados.</p>
          ) : (
            <ul className="space-y-2">
              {eventos.map((e) => (
                <li key={e.id} className={`rounded-lg border p-3 text-sm ${e.tom === "ruim" ? "border-destructive/40" : "border-border"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{e.titulo}</span>
                    <Badge variant={e.tom === "ruim" ? "destructive" : "outline"} className="text-[11px]">{e.badge}</Badge>
                  </div>
                  {e.linhas.map((l, i) => <p key={i} className="text-xs text-muted-foreground">{l}</p>)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </DpContentCard>
  );
}
