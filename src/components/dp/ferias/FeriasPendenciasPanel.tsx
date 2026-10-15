import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowRight, FileText, FileWarning, Inbox, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DpContentCard } from "@/components/dp/DpPage";
import { useDpFeriasSolicitacoes } from "@/hooks/useDpFeriasSolicitacoes";
import { useDpFeriasDocumentos } from "@/hooks/useDpFeriasDocumentos";
import type { FeriasGozo } from "@/hooks/useDpFerias";
import { dataBr as fmt } from "@/lib/dp/formato";

type Tipo = "pedido" | "contabilidade" | "aviso" | "recibo";

const TIPO: Record<Tipo, { label: string; icon: typeof Inbox; acao: string }> = {
  pedido: { label: "Pedido do colaborador", icon: Inbox, acao: "Decidir" },
  contabilidade: { label: "A informar à contabilidade", icon: Send, acao: "Conferir" },
  aviso: { label: "Aviso não registrado", icon: FileWarning, acao: "Registrar aviso" },
  recibo: { label: "Recibo não anexado", icon: FileText, acao: "Anexar recibo" },
};

type Item = { id: string; tipo: Tipo; nome: string; detalhe: string; data: string };

type Props = {
  gozos: FeriasGozo[];
  nomeColaborador: (id: string) => string;
  irPara: (aba: string, extra?: Record<string, string>) => void;
};

const ATIVAS = new Set(["aprovado", "em_gozo", "concluido"]);

/** Fila única: pedidos, encaminhamento à contabilidade, avisos e recibos. */
export function FeriasPendenciasPanel({ gozos, nomeColaborador, irPara }: Props) {
  const { solicitacoes: pedidos } = useDpFeriasSolicitacoes(["pendente"]);
  const { docsDoGozo } = useDpFeriasDocumentos();
  const [filtro, setFiltro] = useState<Tipo | "todas">("todas");
  const hoje = format(new Date(), "yyyy-MM-dd");

  const itens = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const periodo = (g: { data_inicio: string; data_fim: string }) => `${fmt(g.data_inicio)} a ${fmt(g.data_fim)}`;
    for (const p of pedidos) {
      out.push({
        id: `p-${p.id}`, tipo: "pedido", data: p.data_inicio,
        nome: p.colaborador_nome ?? nomeColaborador(p.colaborador_id),
        detalhe: `${periodo(p)} · ${p.dias} dias`,
      });
    }
    for (const g of gozos) {
      if (g.status === "cancelado") continue;
      const nome = nomeColaborador(g.colaborador_id);
      if (ATIVAS.has(g.status) && g.contabilidade_status !== "informada") {
        out.push({
          id: `c-${g.id}`, tipo: "contabilidade", nome, data: g.data_inicio,
          detalhe: `${periodo(g)} · ${g.dias} dias · datas reservadas, ainda não encaminhadas`,
        });
      }
      if ((g.status === "planejado" || g.status === "aprovado") && !g.aviso_em) {
        out.push({ id: `a-${g.id}`, tipo: "aviso", nome, data: g.data_inicio, detalhe: `Início ${fmt(g.data_inicio)}` });
      }
      if (g.data_inicio <= hoje && docsDoGozo(g.id).recibo_ferias.length === 0) {
        out.push({ id: `r-${g.id}`, tipo: "recibo", nome, data: g.data_inicio, detalhe: `Férias de ${periodo(g)}` });
      }
    }
    return out.sort((a, b) => a.data.localeCompare(b.data));
  }, [pedidos, gozos, nomeColaborador, docsDoGozo, hoje]);

  const contagem = (t: Tipo) => itens.filter((i) => i.tipo === t).length;
  const visiveis = filtro === "todas" ? itens : itens.filter((i) => i.tipo === filtro);

  const abrir = (t: Tipo) => {
    if (t === "pedido") irPara("status", { status: "solicitadas" });
    else if (t === "contabilidade") irPara("contabilidade");
    else irPara("status", { status: t === "aviso" ? "programadas" : "em-ferias" });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={filtro === "todas" ? "secondary" : "outline"} onClick={() => setFiltro("todas")}>
          Todas ({itens.length})
        </Button>
        {(Object.keys(TIPO) as Tipo[]).map((t) => (
          <Button key={t} size="sm" variant={filtro === t ? "secondary" : "outline"} onClick={() => setFiltro(t)}>
            {TIPO[t].label} ({contagem(t)})
          </Button>
        ))}
      </div>

      {contagem("contabilidade") > 0 && (filtro === "todas" || filtro === "contabilidade") && (
        <p className="rounded-lg border-l-4 border-l-amber-500 bg-muted/40 p-3 text-sm">
          <strong>{contagem("contabilidade")} férias</strong> estão com as datas reservadas no AVETO 360, mas ainda
          precisam ser encaminhadas à contabilidade externa. Marcar como informada não confirma o lançamento por lá.
        </p>
      )}

      <DpContentCard contentClassName="p-0">
        {visiveis.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma pendência de férias.</p>
        ) : (
          <ul className="divide-y divide-border">
            {visiveis.map((i) => {
              const T = TIPO[i.tipo];
              return (
                <li key={i.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                  <T.icon className="hidden size-5 shrink-0 text-primary sm:block" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{i.nome}</span>
                      <Badge variant="outline" className="text-[11px]">{T.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{i.detalhe}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => abrir(i.tipo)} className="w-full sm:w-auto">
                    {T.acao} <ArrowRight className="ml-1 size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </DpContentCard>
    </div>
  );
}
