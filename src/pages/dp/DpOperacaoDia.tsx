import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarClock, ChevronLeft, ChevronRight, Users, Clock, AlertTriangle, Pencil,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpEscalaMes } from "@/hooks/useDpEscalaMes";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import { itemDeTurno, STATUS_LABEL, type EscalaItem } from "@/lib/dp/escala-mes";
import { montarOperacaoDia, alertasDoDia, rotuloAusencia, type PessoaDia } from "@/lib/dp/operacao-dia";
import { resolverCoberturaMinima } from "@/lib/dp/cobertura-utils";
import { useDpCoberturaMinima } from "@/hooks/useDpCoberturaMinima";

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

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const dataExtenso = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long",
  });

function Secao({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <DpContentCard contentClassName="p-4">
      <div className="mb-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </DpContentCard>
  );
}

export default function DpOperacaoDia() {
  const { selectedCompanyId } = useCompanyContext();
  const [data, setData] = useState(hojeIso);
  const [unidade, setUnidade] = useState<string>("todas");
  const [pessoa, setPessoa] = useState<PessoaDia | null>(null);

  const unidadeId = unidade === "todas" ? null : unidade;
  const competencia = data.slice(0, 7);
  const escalaMes = useDpEscalaMes(competencia, unidadeId);

  const unidades = useQuery({
    queryKey: ["dp_unidades_operacao", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("dp_unidades")
        .select("id, nome")
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (error) throw error;
      return rows ?? [];
    },
  });

  const { escala, itens, colaboradores, turnos } = escalaMes;
  const { regras: regrasCobertura } = useDpCoberturaMinima();

  const coberturaMinima = useMemo(
    () =>
      resolverCoberturaMinima({
        regras: regrasCobertura,
        data,
        unidadeId,
        turnoIds: turnos.map((t) => t.id),
      }),
    [regrasCobertura, data, unidadeId, turnos],
  );

  const dia = useMemo(
    () =>
      montarOperacaoDia({
        data,
        itens,
        colaboradores: colaboradores.map((c) => ({ id: c.id, nome: c.nome })),
        turnos: turnos.map((t) => ({
          id: t.id, nome: t.nome, cor: t.cor, entrada: t.entrada, saida: t.saida,
        })),
        coberturaMinima,
      }),
    [data, itens, colaboradores, turnos, coberturaMinima],
  );

  const alertas = useMemo(() => alertasDoDia(dia), [dia]);

  const ajustar = (tipo: "folga" | "trabalho", turnoId?: string) => {
    if (!pessoa) return;
    let item: EscalaItem;
    if (tipo === "folga") {
      item = {
        colaborador_id: pessoa.colaborador_id,
        data,
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
      item = itemDeTurno(pessoa.colaborador_id, data, turno, "manual");
    }
    escalaMes.ajustarDia.mutate(item, {
      onSuccess: () => {
        toast.success("Operação do dia atualizada.");
        setPessoa(null);
      },
      onError: (e: unknown) => toast.error((e as Error).message ?? "Não foi possível ajustar o dia."),
    });
  };

  if (escalaMes.error) {
    return <DpErrorState message="Não foi possível carregar a operação do dia." />;
  }

  return (
    <DpPage>
      <Helmet>
        <title>Operação do Dia | Pessoas 360°FOOD</title>
        <meta
          name="description"
          content="Veja quem trabalha hoje por turno, quem está ausente e ajuste a escala do dia na unidade."
        />
      </Helmet>

      <DpPageHeader
        title="Operação do Dia"
        description="Quem entra, quem folga e onde falta gente hoje."
        icon={CalendarClock}
      />

      <DpFilterCard>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="data-operacao">Dia</Label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Dia anterior" onClick={() => setData(somarDias(data, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                id="data-operacao"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value || hojeIso())}
              />
              <Button variant="outline" size="icon" aria-label="Próximo dia" onClick={() => setData(somarDias(data, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Unidade</Label>
            <Select value={unidade} onValueChange={setUnidade}>
              <SelectTrigger><SelectValue placeholder="Todas as unidades" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as unidades</SelectItem>
                {(unidades.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setData(hojeIso())}>Hoje</Button>
          <span className="text-sm text-muted-foreground first-letter:uppercase">{dataExtenso(data)}</span>
          {escala && <Badge variant="outline">{STATUS_LABEL[escala.status]}</Badge>}
        </div>
      </DpFilterCard>

      {escalaMes.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Escalados", valor: String(dia.resumo.escalados), icon: Users },
              { label: "Ausentes", valor: String(dia.resumo.ausentes), icon: Users },
              { label: "Carga prevista", valor: formatarHoras(dia.resumo.cargaPrevista), icon: Clock },
              { label: "Ajustes do dia", valor: String(dia.resumo.ajustes), icon: Pencil },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <c.icon className="h-3.5 w-3.5" />
                  {c.label}
                </div>
                <p className="mt-1 text-lg font-semibold">{c.valor}</p>
              </div>
            ))}
          </div>

          {alertas.length > 0 && (
            <Secao title="Pontos de atenção">
              <ul className="space-y-2">
                {alertas.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <AlertTriangle
                      className={`mt-0.5 h-4 w-4 shrink-0 ${a.nivel === "erro" ? "text-destructive" : "text-muted-foreground"}`}
                    />
                    <span>{a.mensagem}</span>
                  </li>
                ))}
              </ul>
            </Secao>
          )}

          {!itens.length ? (
            <Secao title="Sem escala para este mês">
              <p className="text-sm text-muted-foreground">
                Gere a escala do mês para acompanhar a operação do dia.
              </p>
            </Secao>
          ) : (
            dia.blocos.map((bloco) => (
              <Secao
                key={bloco.turno_id ?? "sem-turno"}
                title={bloco.nome}
                description={
                  bloco.entrada && bloco.saida
                    ? `${bloco.entrada} às ${bloco.saida} · ${bloco.pessoas.length} pessoa(s)`
                    : `${bloco.pessoas.length} pessoa(s)`
                }
              >
                <ul className="divide-y">
                  {bloco.pessoas.map((p) => (
                    <li key={p.colaborador_id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.entrada ?? "--:--"} às {p.saida ?? "--:--"}
                          {p.termina_no_dia_seguinte ? " (+1)" : ""} · {formatarHoras(p.carga_prevista_horas)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {p.ajustado && <Badge variant="secondary">Ajustado</Badge>}
                        <Button variant="ghost" size="sm" onClick={() => setPessoa(p)}>Ajustar</Button>
                      </div>
                    </li>
                  ))}
                  {!bloco.pessoas.length && (
                    <li className="py-2 text-sm text-muted-foreground">Ninguém escalado neste turno.</li>
                  )}
                </ul>
              </Secao>
            ))
          )}

          {dia.ausentes.length > 0 && (
            <Secao title="Ausentes" description={`${dia.ausentes.length} pessoa(s) fora da operação`}>
              <ul className="divide-y">
                {dia.ausentes.map((p) => (
                  <li key={p.colaborador_id} className="flex items-center justify-between gap-3 py-2">
                    <span className="truncate text-sm">{p.nome}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline">{rotuloAusencia(p.tipo)}</Badge>
                      <Button variant="ghost" size="sm" onClick={() => setPessoa(p)}>Ajustar</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Secao>
          )}

          {dia.semEscala.length > 0 && (
            <Secao title="Sem registro na escala" description="Colaboradores sem configuração de trabalho vigente">
              <ul className="divide-y">
                {dia.semEscala.map((c) => (
                  <li key={c.id} className="py-2 text-sm">{c.nome}</li>
                ))}
              </ul>
            </Secao>
          )}
        </>
      )}

      <Dialog open={!!pessoa} onOpenChange={(o) => !o && setPessoa(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar {pessoa?.nome}</DialogTitle>
            <DialogDescription className="first-letter:uppercase">{dataExtenso(data)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {turnos.map((t) => (
              <Button
                key={t.id}
                variant="outline"
                className="w-full justify-between"
                disabled={escalaMes.ajustarDia.isPending}
                onClick={() => ajustar("trabalho", t.id)}
              >
                <span>{t.nome}</span>
                <span className="text-xs text-muted-foreground">{t.entrada} às {t.saida}</span>
              </Button>
            ))}
            <Button
              variant="secondary"
              className="w-full"
              disabled={escalaMes.ajustarDia.isPending}
              onClick={() => ajustar("folga")}
            >
              Marcar folga
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DpPage>
  );
}
