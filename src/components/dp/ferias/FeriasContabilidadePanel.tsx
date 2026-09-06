import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DpContentCard } from "@/components/dp/DpPage";
import { useDpFerias } from "@/hooks/useDpFerias";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import {
  FeriasResumoContabilidadeDialog, type ResumoContabilidade,
} from "@/components/dp/ferias/FeriasResumoContabilidadeDialog";

const fmt = (iso: string) => format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });

const mascararCpf = (cpf?: string | null) => {
  const d = (cpf ?? "").replace(/\D/g, "");
  if (d.length !== 11) return "não informado";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
};

const STATUS_LABEL: Record<string, string> = {
  aprovada: "A informar",
  a_informar: "A informar",
  informada: "Informada",
};

/** Fila de férias a informar para a contabilidade, sem nenhum valor. */
export function FeriasContabilidadePanel() {
  const { gozos, gozosLoading, periodos, marcarInformado } = useDpFerias("todos");
  const { data: colaboradores = [] } = useDpColaboradores();
  const { data: unidades = [] } = useDpUnidades();
  const [unidadeId, setUnidadeId] = useState("todas");
  const [mes, setMes] = useState("");
  const [situacao, setSituacao] = useState<"a_informar" | "informada" | "todas">("a_informar");
  const [resumo, setResumo] = useState<ResumoContabilidade | null>(null);

  const porId = useMemo(
    () => new Map(colaboradores.map((c: any) => [c.id, c])),
    [colaboradores],
  );
  const unidadeNome = useMemo(
    () => new Map((unidades as any[]).map((u) => [u.id, u.nome as string])),
    [unidades],
  );
  const periodoPorId = useMemo(() => new Map(periodos.map((p) => [p.id, p])), [periodos]);

  const lista = useMemo(
    () =>
      gozos
        .filter((g) => g.status === "aprovado" || g.status === "em_gozo" || g.status === "concluido")
        .filter((g) => {
          const informada = g.contabilidade_status === "informada";
          if (situacao === "a_informar") return !informada;
          if (situacao === "informada") return informada;
          return true;
        })
        .filter((g) => {
          if (unidadeId === "todas") return true;
          return (porId.get(g.colaborador_id) as any)?.unidade_id === unidadeId;
        })
        .filter((g) => (mes ? g.data_inicio.slice(0, 7) === mes : true))
        .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)),
    [gozos, situacao, unidadeId, mes, porId],
  );

  return (
    <div className="space-y-4">
      <DpContentCard contentClassName="grid gap-3 p-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase text-muted-foreground">Unidade</Label>
          <Select value={unidadeId} onValueChange={setUnidadeId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {(unidades as any[]).map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase text-muted-foreground">Mês de início</Label>
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase text-muted-foreground">Situação</Label>
          <Select value={situacao} onValueChange={(v) => setSituacao(v as typeof situacao)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="a_informar">A informar</SelectItem>
              <SelectItem value="informada">Informadas</SelectItem>
              <SelectItem value="todas">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </DpContentCard>

      <DpContentCard>
        {gozosLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando…</div>
        ) : lista.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nada a informar com esses filtros.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {lista.map((g) => {
              const col: any = porId.get(g.colaborador_id);
              const periodo = periodoPorId.get(g.periodo_id);
              const nome = col?.nome ?? periodo?.colaborador_nome ?? "Colaborador";
              const informada = g.contabilidade_status === "informada";
              return (
                <div key={g.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{nome}</p>
                    <p className="text-sm text-muted-foreground">
                      {fmt(g.data_inicio)} a {fmt(g.data_fim)} · {g.dias} dias
                      {g.dias_abono > 0 && ` + ${g.dias_abono} de abono`}
                      {g.adiantar_13 && " · 13º adiantado"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {unidadeNome.get(col?.unidade_id) ?? "Sem unidade"}
                      {g.informado_em && ` · informada em ${fmt(g.informado_em.slice(0, 10))}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={
                        informada
                          ? "bg-emerald-500/15 text-emerald-600"
                          : "bg-amber-500/15 text-amber-600"
                      }
                    >
                      {STATUS_LABEL[g.contabilidade_status ?? "aprovada"] ?? "A informar"}
                    </Badge>
                    <Button
                      size="sm"
                      variant={informada ? "ghost" : "default"}
                      onClick={() =>
                        setResumo({
                          gozoId: g.id,
                          nome,
                          cpfMascarado: mascararCpf(col?.cpf),
                          unidade: unidadeNome.get(col?.unidade_id) ?? "Sem unidade",
                          periodoAquisitivo: periodo
                            ? `${fmt(periodo.inicio_aquisitivo)} a ${fmt(periodo.fim_aquisitivo)}`
                            : "não informado",
                          datas: `${fmt(g.data_inicio)} a ${fmt(g.data_fim)}`,
                          dias: g.dias,
                          diasAbono: g.dias_abono ?? 0,
                          adiantar13: !!g.adiantar_13,
                          observacao: g.observacao ?? null,
                        })
                      }
                    >
                      <Send className="mr-1 size-3.5" />
                      {informada ? "Ver resumo" : "Informar"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DpContentCard>

      <FeriasResumoContabilidadeDialog
        resumo={resumo}
        onOpenChange={(v) => { if (!v) setResumo(null); }}
        saving={marcarInformado.isPending}
        onConfirmar={() =>
          resumo &&
          marcarInformado.mutate(
            { id: resumo.gozoId, status: "informada" },
            { onSuccess: () => setResumo(null) },
          )
        }
      />
    </div>
  );
}
