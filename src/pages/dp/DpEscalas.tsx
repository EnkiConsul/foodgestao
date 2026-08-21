import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange, Wand2, Download, AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpConfigDp } from "@/hooks/useDpConfigDp";
import { semanasEfetivas, semanasEfetivasMulher } from "@/lib/dp/dsr-rules";
import { contratoPolicy } from "@/lib/dp/contrato-policy";

import { expandRegraNoIntervalo, type RegraRow } from "@/lib/dp/bloqueio-rules";
import {
  gerarEscala, parseIso, type EscalaProposta, type EscalaAlerta, type EscalaColaborador,
} from "@/lib/dp/escala-generator";
import {
  calcularCargaDaEscala, formatarHoras, validarCargaSemanal, type HorarioDia,
} from "@/lib/dp/jornada-utils";

import { DpPage, DpPageHeader, DpFilterCard, DpContentCard } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const competenciaAtual = () => new Date().toISOString().slice(0, 7);

function limitesDoMes(competencia: string) {
  const [y, m] = competencia.split("-").map(Number);
  const inicio = `${competencia}-01`;
  const fim = `${competencia}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  return { inicio, fim };
}

const diaSemanaLabel = (iso: string) =>
  format(parseIso(iso), "EEEE", { locale: ptBR });

export default function DpEscalas() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [unidade, setUnidade] = useState("todas");
  const [resultado, setResultado] = useState<{ propostas: EscalaProposta[]; alertas: EscalaAlerta[] } | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());

  // Regra vigente: exceção da unidade selecionada, senão o padrão da empresa.
  const { config } = useDpConfigDp(unidade === "todas" ? null : unidade);
  const semanasDsr = semanasEfetivas(config);
  const semanasDsrMulher = semanasEfetivasMulher(config);


  const { inicio, fim } = useMemo(() => limitesDoMes(competencia), [competencia]);

  const dados = useQuery({
    queryKey: ["dp_escala_base", selectedCompanyId, competencia],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const [colabs, unidades, vinculos, ferias, folgas, diaConfig, datas, regras, regraUnid] = await Promise.all([
        supabase.from("dp_colaboradores").select("id, nome, sexo, unidade_id, regime")
          .eq("company_id", selectedCompanyId!).eq("ativo", true).order("nome"),

        supabase.from("dp_unidades").select("id, nome").eq("company_id", selectedCompanyId!).order("nome"),
        supabase.from("dp_colaborador_jornadas")
          .select("colaborador_id, inicio, fim, folga_fixa_semana_override, jornada:dp_jornadas(dias_folga, horarios:dp_jornada_horarios(dia_semana, entrada, saida, intervalo_minutos))")
          .eq("company_id", selectedCompanyId!).lte("inicio", fim),

        supabase.from("dp_ferias_gozos").select("colaborador_id, data_inicio, data_fim, status")
          .eq("company_id", selectedCompanyId!).lte("data_inicio", fim).gte("data_fim", inicio),
        supabase.from("dp_folgas").select("colaborador_id, data, status")
          .eq("company_id", selectedCompanyId!).gte("data", inicio).lte("data", fim),
        supabase.from("dp_dia_config").select("data, limite_folgas")
          .eq("company_id", selectedCompanyId!).gte("data", inicio).lte("data", fim),
        supabase.from("dp_datas_bloqueadas").select("data, liberada, unidade_id")
          .eq("company_id", selectedCompanyId!).gte("data", inicio).lte("data", fim),
        supabase.from("dp_bloqueio_regras")
          .select("id, company_id, nome, tipo, mes, dia, regra_json, ativo")
          .eq("company_id", selectedCompanyId!).eq("ativo", true),
        supabase.from("dp_bloqueio_regra_unidades").select("regra_id, unidade_id"),
      ]);
      const err = [colabs, unidades, vinculos, ferias, folgas, diaConfig, datas, regras].find((r) => r.error);
      if (err?.error) throw err.error;
      return {
        colaboradores: colabs.data ?? [],
        unidades: unidades.data ?? [],
        vinculos: vinculos.data ?? [],
        ferias: ferias.data ?? [],
        folgas: folgas.data ?? [],
        diaConfig: diaConfig.data ?? [],
        datas: datas.data ?? [],
        regras: (regras.data ?? []) as RegraRow[],
        regraUnid: regraUnid.data ?? [],
      };
    },
  });

  const gerar = () => {
    const d = dados.data;
    if (!d) return;

    const horariosPorColaborador = new Map<string, HorarioDia[]>();
    // Contratos sem escala automática (ex.: intermitente) trabalham por convocação.
    const colaboradores: EscalaColaborador[] = d.colaboradores
      .filter((c) => unidade === "todas" || c.unidade_id === unidade)
      .filter((c) => contratoPolicy(c.regime).participaEscalaAutomatica)
      .map((c) => {

        const vinculo = d.vinculos
          .filter((v) => v.colaborador_id === c.id && (!v.fim || v.fim >= inicio))
          .sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
        const jornada = vinculo?.jornada as
          | { dias_folga: number[]; horarios?: HorarioDia[] | null }
          | null
          | undefined;
        horariosPorColaborador.set(c.id, jornada?.horarios ?? []);
        return {
          id: c.id,
          nome: c.nome,
          sexo: c.sexo,
          unidadeId: c.unidade_id,
          diasFolga: jornada?.dias_folga ?? [0],
          folgaFixa: vinculo?.folga_fixa_semana_override ?? null,
        };
      });


    // Datas bloqueadas: registros não liberados + expansão das regras ativas.
    const bloqueadas = new Set<string>();
    for (const b of d.datas) {
      if (b.liberada) continue;
      if (unidade !== "todas" && b.unidade_id && b.unidade_id !== unidade) continue;
      bloqueadas.add(b.data);
    }
    const de = parseIso(inicio);
    const ate = parseIso(fim);
    const unidadesDaRegra = new Map<string, string[]>();
    for (const rv of d.regraUnid) {
      unidadesDaRegra.set(rv.regra_id, [...(unidadesDaRegra.get(rv.regra_id) ?? []), rv.unidade_id]);
    }
    for (const r of d.regras) {
      const vinculadas = unidadesDaRegra.get(r.id);
      if (unidade !== "todas" && vinculadas?.length && !vinculadas.includes(unidade)) continue;
      for (const data of expandRegraNoIntervalo(r, de, ate)) bloqueadas.add(data);
    }
    // Uma liberação explícita vence a regra.
    for (const b of d.datas) if (b.liberada) bloqueadas.delete(b.data);

    const ausencias = new Set<string>();
    for (const f of d.ferias) {
      if (f.status === "cancelado") continue;
      const cur = parseIso(f.data_inicio);
      const end = parseIso(f.data_fim);
      while (cur <= end) {
        ausencias.add(`${f.colaborador_id}|${format(cur, "yyyy-MM-dd")}`);
        cur.setDate(cur.getDate() + 1);
      }
    }

    const folgasExistentes = new Set<string>();
    for (const f of d.folgas) {
      if (f.status === "cancelada") continue;
      folgasExistentes.add(`${f.colaborador_id}|${f.data}`);
    }

    const limitePorDia = new Map<string, number>();
    for (const c of d.diaConfig) if (c.limite_folgas != null) limitePorDia.set(c.data, c.limite_folgas);

    const r = gerarEscala({
      inicio, fim, colaboradores, bloqueadas, ausencias, folgasExistentes, limitePorDia,
      periodicidadeDomingo: semanasDsr,
      periodicidadeDomingoMulher: semanasDsrMulher,
    });

    // Carga semanal na semana efetivamente montada: conta só os dias escalados (sem folgas/ausências).
    const folgasFinais = new Set(folgasExistentes);
    for (const p of r.propostas) folgasFinais.add(`${p.colaboradorId}|${p.data}`);

    // Só contratos com limite legal de carga entram na checagem de 44h semanais.
    const validaCarga = new Set(
      d.colaboradores.filter((c) => contratoPolicy(c.regime).validaCargaSemanal).map((c) => c.id),
    );
    const porSemana = new Map<string, { colaboradorId: string; nome: string; semana: string; dias: number[] }>();
    for (const c of colaboradores) {
      const horarios = horariosPorColaborador.get(c.id) ?? [];
      if (!horarios.length || !validaCarga.has(c.id)) continue;

      const cur = parseIso(inicio);
      const ate = parseIso(fim);
      while (cur <= ate) {
        const iso = format(cur, "yyyy-MM-dd");
        const chaveDia = `${c.id}|${iso}`;
        if (!folgasFinais.has(chaveDia) && !ausencias.has(chaveDia)) {
          const inicioSemana = new Date(cur);
          inicioSemana.setDate(inicioSemana.getDate() - ((inicioSemana.getDay() + 6) % 7));
          const semana = format(inicioSemana, "yyyy-MM-dd");
          const chave = `${c.id}|${semana}`;
          const atual = porSemana.get(chave) ?? { colaboradorId: c.id, nome: c.nome, semana, dias: [] };
          atual.dias.push(cur.getDay());
          porSemana.set(chave, atual);
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    const alertasCarga: EscalaAlerta[] = [];
    for (const s of porSemana.values()) {
      const horarios = horariosPorColaborador.get(s.colaboradorId) ?? [];
      const validacao = validarCargaSemanal(calcularCargaDaEscala(horarios, s.dias));
      if (validacao.excede) {
        alertasCarga.push({
          colaboradorId: s.colaboradorId,
          nome: s.nome,
          tipo: "carga",
          mensagem: `Semana de ${format(parseIso(s.semana), "dd/MM")}: carga escalada de ${formatarHoras(validacao.carga)} excede ${validacao.limite}h.`,


        });
      }
    }

    setResultado({ propostas: r.propostas, alertas: [...r.alertas, ...alertasCarga] });
    setSelecionadas(new Set(r.propostas.map((p) => `${p.colaboradorId}|${p.data}`)));
    if (r.propostas.length === 0) toast.info("Nenhuma folga nova a propor para este período.");

  };

  const publicar = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId || !resultado) throw new Error("Nada a publicar");
      const rows = resultado.propostas
        .filter((p) => selecionadas.has(`${p.colaboradorId}|${p.data}`))
        .map((p) => ({
          company_id: selectedCompanyId,
          colaborador_id: p.colaboradorId,
          data: p.data,
          tipo: "normal" as const,
          origem: "admin_manual" as const,
          status: "agendada" as const,
          observacao: `Escala gerada — ${p.motivo}`,
        }));
      if (rows.length === 0) throw new Error("Selecione ao menos uma folga");
      const { error } = await supabase.from("dp_folgas").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} folga(s) publicada(s) na escala`);
      setResultado(null);
      setSelecionadas(new Set());
      qc.invalidateQueries({ queryKey: ["dp_folgas"] });
      qc.invalidateQueries({ queryKey: ["dp_folgas_efetivadas"] });
      qc.invalidateQueries({ queryKey: ["dp_escala_base"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao publicar a escala"),
  });

  const exportarCsv = () => {
    if (!resultado) return;
    const linhas = resultado.propostas.map((p) => [
      p.data, `"${p.nome.replace(/"/g, '""')}"`, `"${p.motivo}"`,
    ]);
    const csv = [["Data", "Colaborador", "Motivo"].join(";"), ...linhas.map((l) => l.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `escala_${competencia}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggle = (chave: string) =>
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });

  return (
    <DpPage>
      <Helmet>
        <title>Gerador de escala — Pessoas 360°</title>
        <meta
          name="description"
          content="Gere a escala mensal de folgas respeitando jornadas, férias, datas bloqueadas e o descanso semanal remunerado."
        />
      </Helmet>

      <DpPageHeader
        icon={CalendarRange}
        title="Gerador de escala"
        description="Proposta automática de folgas por jornada vigente, com validação de DSR, férias, bloqueios e limite diário."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportarCsv} disabled={!resultado?.propostas.length}>
              <Download className="mr-1 h-4 w-4" /> Exportar CSV
            </Button>
            <Button onClick={gerar} disabled={dados.isLoading || !dados.data}>
              <Wand2 className="mr-1 h-4 w-4" /> Gerar proposta
            </Button>
          </div>
        }
      />

      <DpFilterCard>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Competência</Label>
            <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Unidade</Label>
            <Select value={unidade} onValueChange={setUnidade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as unidades</SelectItem>
                {(dados.data?.unidades ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end text-xs text-muted-foreground">
            Folga dominical a cada {semanasDsr ? semanasDsr.toFixed(1) : "—"} semana(s) —{" "}
            {semanasDsrMulher ? semanasDsrMulher.toFixed(1) : "—"} para colaboradoras.
          </div>
        </div>
      </DpFilterCard>

      {dados.isError ? (
        <DpErrorState onRetry={() => dados.refetch()} />
      ) : dados.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !resultado ? (
        <DpContentCard contentClassName="p-10 text-center text-sm text-muted-foreground">
          Escolha a competência e clique em <strong>Gerar proposta</strong> para montar a escala do período.
        </DpContentCard>
      ) : (
        <>
          {resultado.alertas.length > 0 && (
            <DpContentCard contentClassName="p-4 md:p-5">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4" /> {resultado.alertas.length} alerta(s) de conformidade
              </h2>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {resultado.alertas.map((a, i) => (
                  <li key={`${a.colaboradorId}-${i}`}>
                    <span className="font-medium text-foreground">{a.nome}:</span> {a.mensagem}
                  </li>
                ))}
              </ul>
            </DpContentCard>
          )}

          <DpContentCard contentClassName="p-4 md:p-5">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <h2 className="flex items-start gap-2 text-sm font-semibold">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {resultado.propostas.length} folga(s) propostas — {selecionadas.size} selecionada(s)
              </h2>
              <Button
                className="w-full sm:w-auto"
                onClick={() => publicar.mutate()}
                disabled={publicar.isPending || selecionadas.size === 0}
              >
                <Upload className="mr-1 h-4 w-4" />
                {publicar.isPending ? "Publicando…" : "Publicar escala"}
              </Button>
            </div>

            {/* Mobile: cartões selecionáveis */}
            <ul className="space-y-2 md:hidden">
              {resultado.propostas.length === 0 && (
                <li className="py-6 text-center text-sm text-muted-foreground">Nenhuma folga a propor.</li>
              )}
              {resultado.propostas.map((p) => {
                const chave = `${p.colaboradorId}|${p.data}`;
                return (
                  <li key={chave} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3">
                    <Checkbox
                      className="mt-1"
                      checked={selecionadas.has(chave)}
                      onCheckedChange={() => toggle(chave)}
                      aria-label={`Selecionar folga de ${p.nome} em ${p.data}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.nome}</p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {format(parseIso(p.data), "dd/MM/yyyy")} · {diaSemanaLabel(p.data)}
                      </p>
                      <Badge
                        variant={p.motivo.includes("dominical") ? "default" : "secondary"}
                        className="mt-1.5 max-w-full whitespace-normal text-left text-[11px]"
                      >
                        {p.motivo}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Data</TableHead>
                    <TableHead>Dia</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultado.propostas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                        Nenhuma folga a propor.
                      </TableCell>
                    </TableRow>
                  ) : resultado.propostas.map((p) => {
                    const chave = `${p.colaboradorId}|${p.data}`;
                    return (
                      <TableRow key={chave}>
                        <TableCell>
                          <Checkbox
                            checked={selecionadas.has(chave)}
                            onCheckedChange={() => toggle(chave)}
                            aria-label={`Selecionar folga de ${p.nome} em ${p.data}`}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium">
                          {format(parseIso(p.data), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="whitespace-nowrap capitalize text-muted-foreground">
                          {diaSemanaLabel(p.data)}
                        </TableCell>
                        <TableCell>{p.nome}</TableCell>
                        <TableCell>
                          <Badge variant={p.motivo.includes("dominical") ? "default" : "secondary"}>
                            {p.motivo}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </DpContentCard>
        </>
      )}
    </DpPage>
  );
}
