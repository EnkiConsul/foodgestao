import { useMemo } from "react";
import { addDays, format } from "date-fns";
import { ArrowRight, FileWarning, Inbox, Palmtree, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DpContentCard } from "@/components/dp/DpPage";
import { useDpFeriasSolicitacoes } from "@/hooks/useDpFeriasSolicitacoes";
import type { FeriasGozo } from "@/hooks/useDpFerias";
import { dataBr as fmt } from "@/lib/dp/formato";

type Props = {
  gozos: FeriasGozo[];
  nomeColaborador: (id: string) => string;
  irPara: (aba: string, extra?: Record<string, string>) => void;
};

const ATIVAS = new Set(["aprovado", "em_gozo", "concluido"]);

/** Filas de prioridade: o que o gestor precisa resolver hoje em férias. */
export function FeriasVisaoGeral({ gozos, nomeColaborador, irPara }: Props) {
  const { data: pedidos = [] } = useDpFeriasSolicitacoes(["pendente"]);
  const hojeISO = format(new Date(), "yyyy-MM-dd");
  const em14 = format(addDays(new Date(), 14), "yyyy-MM-dd");

  const { aInformar, semAviso, proximas } = useMemo(() => {
    const validos = gozos.filter((g) => g.status !== "cancelado");
    return {
      aInformar: validos
        .filter((g) => ATIVAS.has(g.status) && g.contabilidade_status !== "informada")
        .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)),
      semAviso: validos
        .filter((g) => (g.status === "planejado" || g.status === "aprovado") && !g.aviso_em)
        .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)),
      proximas: validos
        .filter(
          (g) =>
            g.status === "em_gozo" ||
            (g.data_inicio >= hojeISO && g.data_inicio <= em14 && g.status !== "concluido"),
        )
        .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)),
    };
  }, [gozos, hojeISO, em14]);

  const Fila = ({
    icon: Icon, titulo, ajuda, itens, vazio, acao, onAcao, destaque,
  }: {
    icon: typeof Inbox; titulo: string; ajuda: string;
    itens: { id: string; nome: string; detalhe: string }[];
    vazio: string; acao: string; onAcao: () => void; destaque?: boolean;
  }) => (
    <DpContentCard
      contentClassName={`space-y-3 p-4 ${destaque && itens.length ? "border-l-4 border-l-amber-500" : ""}`}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {titulo} <span className="text-muted-foreground">({itens.length})</span>
          </p>
          <p className="text-xs text-muted-foreground">{ajuda}</p>
        </div>
      </div>
      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="divide-y divide-border">
          {itens.slice(0, 5).map((i) => (
            <li key={i.id} className="flex flex-col py-2 text-sm">
              <span className="truncate font-medium">{i.nome}</span>
              <span className="text-xs text-muted-foreground">{i.detalhe}</span>
            </li>
          ))}
          {itens.length > 5 && (
            <li className="py-2 text-xs text-muted-foreground">+{itens.length - 5} outros</li>
          )}
        </ul>
      )}
      {itens.length > 0 && (
        <Button size="sm" variant="outline" onClick={onAcao} className="w-full sm:w-auto">
          {acao} <ArrowRight className="ml-1 size-4" />
        </Button>
      )}
    </DpContentCard>
  );

  const periodo = (g: { data_inicio: string; data_fim: string }) =>
    `${fmt(g.data_inicio)} a ${fmt(g.data_fim)}`;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Fila
        icon={Inbox}
        titulo="Pedidos aguardando decisão"
        ajuda="Pedidos enviados pelos colaboradores no portal."
        itens={pedidos.map((p) => ({
          id: p.id,
          nome: p.colaborador_nome ?? nomeColaborador(p.colaborador_id),
          detalhe: `${periodo(p)} · ${p.dias} dias`,
        }))}
        vazio="Nenhum pedido aguardando."
        acao="Decidir pedidos"
        onAcao={() => irPara("status", { status: "solicitadas" })}
      />
      <Fila
        icon={Send}
        destaque
        titulo="A informar à contabilidade"
        ajuda="As datas estão reservadas no AVETO 360, mas ainda precisam ser encaminhadas à contabilidade externa para registro."
        itens={aInformar.map((g) => ({
          id: g.id, nome: nomeColaborador(g.colaborador_id), detalhe: `${periodo(g)} · ${g.dias} dias`,
        }))}
        vazio="Todas as férias programadas já foram informadas."
        acao="Conferir e marcar como informada"
        onAcao={() => irPara("contabilidade")}
      />
      <Fila
        icon={Palmtree}
        titulo="Em férias e saindo em 14 dias"
        ajuda="Quem está fora agora e quem começa nas próximas duas semanas."
        itens={proximas.map((g) => ({
          id: g.id,
          nome: nomeColaborador(g.colaborador_id),
          detalhe:
            g.status === "em_gozo"
              ? `Em férias · volta após ${fmt(g.data_fim)}`
              : `Começa ${fmt(g.data_inicio)} · até ${fmt(g.data_fim)}`,
        }))}
        vazio="Ninguém em férias nem saindo nos próximos 14 dias."
        acao="Ver agenda"
        onAcao={() => irPara("calendario")}
      />
      <Fila
        icon={FileWarning}
        titulo="Aviso de férias não registrado"
        ajuda="A lei pede aviso por escrito com 30 dias de antecedência."
        itens={semAviso.map((g) => ({
          id: g.id, nome: nomeColaborador(g.colaborador_id), detalhe: `Início ${fmt(g.data_inicio)}`,
        }))}
        vazio="Todas as férias programadas têm aviso registrado."
        acao="Registrar avisos"
        onAcao={() => irPara("status", { status: "programadas" })}
      />
    </div>
  );
}
