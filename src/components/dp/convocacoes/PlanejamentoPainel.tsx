import { useMemo, useState } from "react";
import {
  AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, UserX, Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DpContentCard, DpEmptyState } from "@/components/dp/DpPage";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpDisponibilidadePainel } from "@/hooks/useDpDisponibilidadePainel";
import { competenciaLabel, diaMes } from "@/lib/dp/disponibilidade-janela";
import { cn } from "@/lib/utils";

const EMPRESA = "__empresa__";

function competenciaInicial(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 2).padStart(2, "0")}-01`;
}

function somaMeses(iso: string, delta: number): string {
  const [a, m] = iso.split("-").map(Number);
  const d = new Date(a, (m ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const DIA_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

interface ConflitoDia {
  data: string;
  colaborador_id: string;
}

function useConflitos(competencia: string, unidadeId: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const [ano, mes] = competencia.split("-").map(Number);
  const inicio = `${competencia}`;
  const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(
    new Date(ano, mes, 0).getDate(),
  ).padStart(2, "0")}`;

  return useQuery({
    queryKey: ["dp_planejamento_conflitos", selectedCompanyId, unidadeId, competencia],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<ConflitoDia[]> => {
      let q = (supabase.from as any)("dp_indisponibilidades")
        .select("data, colaborador_id, dp_colaboradores!inner(unidade_id)")
        .eq("company_id", selectedCompanyId)
        .eq("conflito", true)
        .is("cancelada_em", null)
        .gte("data", inicio)
        .lte("data", fim);
      if (unidadeId) q = q.eq("dp_colaboradores.unidade_id", unidadeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ data: r.data, colaborador_id: r.colaborador_id }));
    },
  });
}

/**
 * Visão consolidada do mês: disponibilidade informada, convocações e conflitos,
 * com atalho para planejar o dia direto no planejador de convocação.
 */
export function PlanejamentoPainel({
  onPlanejarDia,
}: {
  onPlanejarDia: (unidadeId: string | null, data: string) => void;
}) {
  const [escopo, setEscopo] = useState<string>(EMPRESA);
  const [competencia, setCompetencia] = useState<string>(competenciaInicial);
  const unidadeId = escopo === EMPRESA ? null : escopo;

  const unidades = useDpUnidades();
  const painel = useDpDisponibilidadePainel(unidadeId, competencia);
  const conflitos = useConflitos(competencia, unidadeId);

  const conflitoPorDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of conflitos.data ?? []) m.set(c.data, (m.get(c.data) ?? 0) + 1);
    return m;
  }, [conflitos.data]);

  const conflitoPorColaborador = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of conflitos.data ?? [])
      m.set(c.colaborador_id, (m.get(c.colaborador_id) ?? 0) + 1);
    return m;
  }, [conflitos.data]);

  const semanas = useMemo(() => {
    const dias = painel.data?.dias ?? [];
    if (dias.length === 0) return [];
    const primeiro = new Date(`${dias[0].data}T12:00:00`).getDay();
    const celulas: (typeof dias[number] | null)[] = [
      ...Array<null>(primeiro).fill(null),
      ...dias,
    ];
    while (celulas.length % 7 !== 0) celulas.push(null);
    const out: (typeof celulas)[] = [];
    for (let i = 0; i < celulas.length; i += 7) out.push(celulas.slice(i, i + 7));
    return out;
  }, [painel.data]);

  const totais = useMemo(() => {
    const dias = painel.data?.dias ?? [];
    return {
      convocados: dias.reduce((s, d) => s + d.aceitas + d.pendentes, 0),
      confirmados: dias.reduce((s, d) => s + d.aceitas, 0),
      indisponibilidades: dias.reduce((s, d) => s + d.indisponiveis, 0),
      conflitos: (conflitos.data ?? []).length,
      diasDescobertos: dias.filter((d) => d.pendentes > 0 && d.aceitas === 0).length,
    };
  }, [painel.data, conflitos.data]);

  const carregando = painel.isLoading || conflitos.isLoading;

  return (
    <div className="space-y-3">
      <DpContentCard>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Unidade</Label>
            <Select value={escopo} onValueChange={setEscopo}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Toda a empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPRESA}>Toda a empresa</SelectItem>
                {(unidades.data ?? []).map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Competência</Label>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => setCompetencia((c) => somaMeses(c, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[130px] rounded-md border border-border px-3 py-2 text-center text-sm font-medium">
                {competenciaLabel(competencia)}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => setCompetencia((c) => somaMeses(c, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {carregando ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Montando o planejamento…
          </div>
        ) : !painel.data || painel.data.resumo.convocaveis === 0 ? (
          <DpEmptyState icon={Users} dashed>
            <div className="space-y-1">
              <p className="font-medium text-foreground">Nenhum trabalhador convocável</p>
              <p>
                Cadastre intermitentes ou freelancers com acesso ao portal para planejar este mês.
              </p>
            </div>
          </DpEmptyState>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Resumo valor={totais.convocados} rotulo="convocado(s)" />
              <Resumo valor={totais.confirmados} rotulo="confirmado(s)" />
              <Resumo valor={totais.indisponibilidades} rotulo="indisponibilidade(s)" />
              <Resumo valor={totais.conflitos} rotulo="aviso(s) de ausência" warn={totais.conflitos > 0} />
              <Resumo
                valor={totais.diasDescobertos}
                rotulo="dia(s) sem confirmado"
                warn={totais.diasDescobertos > 0}
              />
            </div>

            <div className="mt-4">
              <div className="grid grid-cols-7 gap-1">
                {DIA_SEMANA.map((d, i) => (
                  <div key={i} className="text-center text-[10px] font-medium text-muted-foreground">
                    {d}
                  </div>
                ))}
              </div>
              <div className="mt-1 space-y-1">
                {semanas.map((sem, i) => (
                  <div key={i} className="grid grid-cols-7 gap-1">
                    {sem.map((dia, j) =>
                      dia ? (
                        <DiaCelula
                          key={dia.data}
                          dia={dia}
                          conflitos={conflitoPorDia.get(dia.data) ?? 0}
                          onPlanejar={() => onPlanejarDia(unidadeId, dia.data)}
                        />
                      ) : (
                        <div key={`vazio-${i}-${j}`} />
                      ),
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Em cada dia: convocados (confirmados + aguardando) sobre quantos ainda podem ser
                chamados. Toque no dia para planejar a convocação dele.
              </p>
            </div>

            <div className="mt-4 space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Por trabalhador
              </h4>
              {painel.data.colaboradores.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ninguém no escopo selecionado.</p>
              ) : (
                painel.data.colaboradores.map((c) => {
                  const conf = conflitoPorColaborador.get(c.colaborador_id) ?? 0;
                  return (
                    <div
                      key={c.colaborador_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.nome}</p>
                        <p className="text-muted-foreground">
                          {c.cargo_nome ?? "—"}
                          {c.unidade_nome ? ` · ${c.unidade_nome}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {!c.informou ? (
                          <Badge variant="outline" className="text-[10px]">
                            não informou
                          </Badge>
                        ) : null}
                        {c.dias_indisponiveis > 0 ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {c.dias_indisponiveis} dia(s) indisponível
                          </Badge>
                        ) : null}
                        {c.alteracoes_tardias > 0 ? (
                          <Badge variant="outline" className="border-amber-500/50 text-[10px]">
                            {c.alteracoes_tardias} alteração(ões) tardia(s)
                          </Badge>
                        ) : null}
                        {conf > 0 ? (
                          <Badge variant="outline" className="border-amber-500/50 text-[10px]">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            avisou ausência em dia convocado
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </DpContentCard>
    </div>
  );
}

function Resumo({ valor, rotulo, warn }: { valor: number; rotulo: string; warn?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border px-3 py-2",
        warn && "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <div className={cn("text-sm font-semibold", warn && "text-amber-700 dark:text-amber-400")}>
        {valor}
      </div>
      <div className="text-[11px] text-muted-foreground">{rotulo}</div>
    </div>
  );
}

function DiaCelula({
  dia,
  conflitos,
  onPlanejar,
}: {
  dia: { data: string; indisponiveis: number; disponiveis: number; pendentes: number; aceitas: number };
  conflitos: number;
  onPlanejar: () => void;
}) {
  const num = Number(dia.data.slice(8, 10));
  const convocados = dia.aceitas + dia.pendentes;
  const descoberto = dia.pendentes > 0 && dia.aceitas === 0;
  const passado = dia.data < new Date().toISOString().slice(0, 10);

  return (
    <button
      type="button"
      onClick={onPlanejar}
      disabled={passado}
      title={`${convocados} convocado(s) (${dia.aceitas} confirmado(s)) · ${dia.disponiveis} ainda disponível(is) · ${dia.indisponiveis} indisponível(is)`}
      className={cn(
        "group rounded-lg border border-border p-1.5 text-left transition-colors hover:bg-muted/50",
        descoberto && "border-destructive/50 bg-destructive/5",
        !descoberto && conflitos > 0 && "border-amber-500/50 bg-amber-500/5",
        passado && "opacity-50",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{diaMes(dia.data)}</span>
        {conflitos > 0 ? <UserX className="h-3 w-3 text-amber-600" /> : null}
      </div>
      <div className="text-sm font-semibold">
        {convocados}
        <span className="text-[10px] font-normal text-muted-foreground"> / {dia.disponiveis + convocados}</span>
      </div>
      <div className="flex items-center justify-between">
        {descoberto ? (
          <span className="text-[10px] text-destructive">sem confirmado</span>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            {dia.aceitas > 0 ? `${dia.aceitas} ok` : "·"}
          </span>
        )}
        {!passado ? (
          <Plus className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        ) : null}
      </div>
    </button>
  );
}
