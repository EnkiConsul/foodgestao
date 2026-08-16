import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Wand2, Send, Undo2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpEscalaMes } from "@/hooks/useDpEscalaMes";
import { contratoPolicy } from "@/lib/dp/contrato-policy";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import {
  resumoPorColaborador,
  validarEscalaMes,
  rotuloCelula,
  itemDeTurno,
  dowDaData,
  parseData,
  STATUS_LABEL,
  type EscalaItem,
} from "@/lib/dp/escala-mes";

import { DpPage, DpPageHeader, DpFilterCard, DpContentCard } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const competenciaAtual = () => new Date().toISOString().slice(0, 7);
const DOW_CURTO = ["D", "S", "T", "Q", "Q", "S", "S"];

export default function DpEscalaMes() {
  const { selectedCompanyId } = useCompanyContext();
  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [unidade, setUnidade] = useState<string>("todas");
  const [celula, setCelula] = useState<{ colaboradorId: string; nome: string; data: string } | null>(null);

  const unidadeId = unidade === "todas" ? null : unidade;
  const escalaMes = useDpEscalaMes(competencia, unidadeId);

  const unidades = useQuery({
    queryKey: ["dp_unidades_escala", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_unidades")
        .select("id, nome")
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { escala, itens, colaboradores, turnos, dias } = escalaMes;
  const publicada = escala?.status === "publicada";

  const porChave = useMemo(() => {
    const m = new Map<string, EscalaItem>();
    for (const i of itens) m.set(`${i.colaborador_id}|${i.data}`, i);
    return m;
  }, [itens]);

  const resumos = useMemo(() => {
    const m = new Map(resumoPorColaborador(itens).map((r) => [r.colaborador_id, r]));
    return m;
  }, [itens]);

  const alertas = useMemo(
    () =>
      itens.length
        ? validarEscalaMes(itens, {
            colaboradores,
            validaCarga: (regime) => contratoPolicy(regime).validaCargaSemanal,
          })
        : [],
    [itens, colaboradores],
  );
  const erros = alertas.filter((a) => a.nivel === "erro");
  const avisos = alertas.filter((a) => a.nivel === "aviso");

  const gerar = () => {
    if (publicada) {
      toast.error("Reabra a escala para regerar.");
      return;
    }
    escalaMes.gerar.mutate(
      {},
      {
        onSuccess: (n) => toast.success(`${n} dias gerados a partir das configurações.`),
        onError: (e: unknown) => toast.error((e as Error).message ?? "Não foi possível gerar a escala."),
      },
    );
  };

  const publicar = () =>
    escalaMes.publicar.mutate(undefined, {
      onSuccess: () => toast.success("Escala publicada para a equipe."),
      onError: (e: unknown) => toast.error((e as Error).message ?? "Não foi possível publicar."),
    });

  const aplicarAjuste = (tipo: "folga" | "trabalho", turnoId?: string) => {
    if (!celula) return;
    const base = { colaborador_id: celula.colaboradorId, data: celula.data };
    let item: EscalaItem;
    if (tipo === "folga") {
      item = {
        ...base,
        tipo: "folga",
        turno_id: null,
        entrada: null,
        saida: null,
        intervalo_minutos: 0,
        termina_no_dia_seguinte: false,
        carga_prevista_horas: 0,
        origem: "manual",
      };
    } else {
      const turno = turnos.find((t) => t.id === turnoId);
      if (!turno) return;
      item = { ...itemDeTurno(base.colaborador_id, base.data, turno, "manual") };
    }
    escalaMes.ajustarDia.mutate(item, {
      onSuccess: () => {
        toast.success("Dia ajustado.");
        setCelula(null);
      },
      onError: (e: unknown) => toast.error((e as Error).message ?? "Não foi possível ajustar o dia."),
    });
  };

  if (escalaMes.error) {
    return <DpErrorState message="Não foi possível carregar a escala do mês." />;
  }

  return (
    <DpPage>
      <Helmet>
        <title>Escala do Mês | Pessoas 360°FOOD</title>
        <meta name="description" content="Monte, confira e publique a escala mensal da unidade a partir da configuração de trabalho." />
      </Helmet>

      <DpPageHeader
        icon={CalendarDays}
        title="Escala do Mês"
        description="Gerada a partir da configuração de trabalho de cada colaborador."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={gerar} disabled={escalaMes.gerar.isPending || publicada}>
              <Wand2 className="mr-2 h-4 w-4" />
              {itens.length ? "Regerar" : "Gerar Escala"}
            </Button>
            {publicada ? (
              <Button size="sm" variant="outline" onClick={() => escalaMes.reabrir.mutate()}>
                <Undo2 className="mr-2 h-4 w-4" />
                Reabrir
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={publicar}
                disabled={!itens.length || erros.length > 0 || escalaMes.publicar.isPending}
              >
                <Send className="mr-2 h-4 w-4" />
                Publicar
              </Button>
            )}
          </div>
        }
      />

      <DpFilterCard>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="competencia">Competência</Label>
            <Input
              id="competencia"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value || competenciaAtual())}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Unidade</Label>
            <Select value={unidade} onValueChange={setUnidade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as unidades</SelectItem>
                {(unidades.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Badge variant={publicada ? "default" : "secondary"}>
              {escala ? STATUS_LABEL[escala.status] : "Sem escala"}
            </Badge>
          </div>
        </div>
      </DpFilterCard>

      {(erros.length > 0 || avisos.length > 0) && (
        <DpContentCard>
          <div className="space-y-2">
            {erros.slice(0, 6).map((a, i) => (
              <p key={`e${i}`} className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {a.mensagem}
              </p>
            ))}
            {avisos.slice(0, 6).map((a, i) => (
              <p key={`a${i}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {a.mensagem}
              </p>
            ))}
          </div>
        </DpContentCard>
      )}

      <DpContentCard contentClassName="p-0">
        {escalaMes.isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !itens.length ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhuma escala gerada para esta competência. Use "Gerar Escala" para montar o mês a partir das
              configurações de trabalho.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="sticky left-0 z-10 min-w-[140px] bg-muted/40 p-2 text-left font-medium">
                    Colaborador
                  </th>
                  {dias.map((d) => {
                    const dow = dowDaData(d);
                    return (
                      <th
                        key={d}
                        className={`min-w-[42px] p-1 text-center font-medium ${dow === 0 ? "text-primary" : ""}`}
                      >
                        <div>{parseData(d).getDate()}</div>
                        <div className="text-[10px] text-muted-foreground">{DOW_CURTO[dow]}</div>
                      </th>
                    );
                  })}
                  <th className="min-w-[70px] p-2 text-right font-medium">Carga</th>
                </tr>
              </thead>
              <tbody>
                {colaboradores.filter((c) => c.config).map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="sticky left-0 z-10 max-w-[140px] truncate bg-background p-2 font-medium">
                      {c.nome}
                    </td>
                    {dias.map((d) => {
                      const item = porChave.get(`${c.id}|${d}`);
                      const trabalha = item?.tipo === "trabalho";
                      return (
                        <td key={d} className="p-0.5 text-center">
                          <button
                            type="button"
                            disabled={publicada}
                            onClick={() => setCelula({ colaboradorId: c.id, nome: c.nome, data: d })}
                            className={`w-full rounded px-1 py-1 text-[10px] transition-colors ${
                              trabalha
                                ? "bg-primary/10 text-primary hover:bg-primary/20"
                                : "bg-muted text-muted-foreground hover:bg-muted/70"
                            } ${publicada ? "cursor-default" : ""}`}
                          >
                            {rotuloCelula(item)}
                          </button>
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap p-2 text-right text-muted-foreground">
                      {formatarHoras(resumos.get(c.id)?.cargaTotal ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DpContentCard>

      {itens.length > 0 && erros.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Escala sem conflitos de carga ou folga.
        </p>
      )}

      <Dialog open={!!celula} onOpenChange={(o) => !o && setCelula(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajustar dia</DialogTitle>
            <DialogDescription>
              {celula ? `${celula.nome} · ${celula.data.split("-").reverse().join("/")}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {turnos.map((t) => (
              <Button
                key={t.id}
                variant="outline"
                className="w-full justify-between"
                onClick={() => aplicarAjuste("trabalho", t.id)}
              >
                <span>{t.nome}</span>
                <span className="text-muted-foreground">{t.entrada} → {t.saida}</span>
              </Button>
            ))}
            <Button variant="secondary" className="w-full" onClick={() => aplicarAjuste("folga")}>
              Marcar folga
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DpPage>
  );
}
