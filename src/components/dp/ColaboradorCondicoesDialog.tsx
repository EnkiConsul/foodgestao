import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { History, Calculator, Lock } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useDpColaboradorCondicoes,
  type CondicaoBeneficioInput,
} from "@/hooks/useDpColaboradorCondicoes";
import {
  useDpUnidades, useDpCargos, useDpSindicatos, useDpCargoSalarios, useDpPatronalPorUnidade,
} from "@/hooks/useDpCadastros";
import { useDpSetores } from "@/hooks/useDpSetores";
import { useDpTurnos } from "@/hooks/useDpTurnos";
import { useDpBeneficios } from "@/hooks/useDpBeneficios";
import { useDpColaboradorConfigTrabalho } from "@/hooks/useDpColaboradorConfigTrabalho";
import { useDpCargoPadrao } from "@/hooks/useDpCargoPadrao";
import { useSindicatoDoCargo } from "@/hooks/useSindicatoDoCargo";
import { contratoPolicy, formasPagamentoDoRegime } from "@/lib/dp/contrato-policy";
import { salarioCargoNaUnidade } from "@/lib/dp/cargoSalarios";
import { salarioProporcional, baseHorasMesSugerida } from "@/lib/dp/jornadaParcial";
import { sugerirModoContinuidade, type ModoContinuidade } from "@/lib/dp/cargoPadrao";
import { DOW_LABEL, diasPadrao, normalizarDias, type DiaConfig } from "@/lib/dp/config-trabalho";
import type { DpColaborador } from "@/hooks/useDpColaboradores";

const REGIMES = ["clt", "intermitente", "estagio", "temporario", "freelancer", "pj", "mei"] as const;

const FORMA_LABEL: Record<string, string> = {
  mensalista: "Mensalista (salário do mês)",
  horista: "Horista (valor da hora)",
  diarista: "Diarista (valor do dia)",
};

/** Abas em que há algo para salvar, na ordem em que o gestor avança. */
const ABAS_EDITAVEIS = ["contrato", "jornada", "remuneracao", "beneficios"] as const;
type AbaEditavel = (typeof ABAS_EDITAVEIS)[number];

const abaSeguinte = (aba: string): string | null => {
  const i = ABAS_EDITAVEIS.indexOf(aba as AbaEditavel);
  if (i < 0) return null;
  return (ABAS_EDITAVEIS[i + 1] as string | undefined) ?? "historico";
};

const hoje = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const fmtMoeda = (v?: number | null) =>
  v == null ? null : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: string) => (v.trim() === "" ? null : Number(String(v).replace(",", ".")));

interface Props {
  colaborador: DpColaborador | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}


/**
 * Alterar Condições de Trabalho: tudo que é contrato do colaborador (vínculo,
 * cargo, unidade, setor, turno e horários, carga, remuneração, sindicato e
 * benefícios) passa a valer a partir de uma data, sem apagar o que valia antes.
 *
 * Ficam fora daqui, de propósito, os dados pessoais/documentais e as
 * preferências do próprio colaborador (ex.: adiantamento salarial).
 */
export function ColaboradorCondicoesDialog({ colaborador, open, onOpenChange }: Props) {
  const { historico, aplicar, isLoading } = useDpColaboradorCondicoes(colaborador?.id);
  const { data: unidades = [] } = useDpUnidades();
  const { data: cargos = [] } = useDpCargos();
  const { setores = [] } = useDpSetores();
  const { data: sindicatos = [] } = useDpSindicatos();
  const { turnos = [] } = useDpTurnos();
  const patronalPorUnidade = useDpPatronalPorUnidade();
  const { beneficios = [], atribuicoes = [] } = useDpBeneficios(colaborador?.id ?? "todos");
  const configs = useDpColaboradorConfigTrabalho(colaborador?.id);

  const [aba, setAba] = useState("contrato");
  const [vigencia, setVigencia] = useState(hoje());
  const [regime, setRegime] = useState<string>("clt");
  const [forma, setForma] = useState<string>("mensalista");
  const [cargoId, setCargoId] = useState<string>("");
  const [unidadeId, setUnidadeId] = useState<string>("");
  const [setorId, setSetorId] = useState<string>("");
  const [sindicatoId, setSindicatoId] = useState<string>("");
  const [equipeHabitual, setEquipeHabitual] = useState(true);
  const [turnoPadraoId, setTurnoPadraoId] = useState<string>("");
  const [cargaSemanal, setCargaSemanal] = useState<string>("");
  const [folgaVariavel, setFolgaVariavel] = useState(true);
  const [dias, setDias] = useState<DiaConfig[]>(diasPadrao());
  const [salario, setSalario] = useState<string>("");
  const [valorHora, setValorHora] = useState<string>("");
  const [baseHoras, setBaseHoras] = useState<string>("");
  const [baseDias, setBaseDias] = useState<string>("");
  const [beneficiosSel, setBeneficiosSel] = useState<Record<string, boolean>>({});
  const [beneficiosValor, setBeneficiosValor] = useState<Record<string, string>>({});
  const [justificativa, setJustificativa] = useState("");
  const [modo, setModo] = useState<ModoContinuidade>("continuidade");
  const [confirmarNovoContrato, setConfirmarNovoContrato] = useState(false);
  /** Campos que o gestor já mexeu à mão: o padrão do cargo não os sobrescreve. */
  const tocados = useRef<Set<string>>(new Set());
  const intencao = useRef<"stay" | "close">("close");
  const marcarTocado = (campo: string) => tocados.current.add(campo);


  const configAberta = useMemo(
    () => (configs.data ?? []).find((c) => !c.vigencia_fim) ?? (configs.data ?? [])[0] ?? null,
    [configs.data],
  );

  useEffect(() => {
    if (!open || !colaborador) return;
    setAba("contrato");
    setVigencia(hoje());
    setRegime(colaborador.regime ?? "clt");
    setForma(colaborador.forma_pagamento ?? "mensalista");
    setCargoId(colaborador.cargo_id ?? "");
    setUnidadeId(colaborador.unidade_id ?? "");
    setSetorId(colaborador.setor_id ?? "");
    setSindicatoId((colaborador as { sindicato_id?: string | null }).sindicato_id ?? "");
    setSalario(colaborador.salario_base != null ? String(colaborador.salario_base) : "");
    setValorHora(colaborador.valor_hora != null ? String(colaborador.valor_hora) : "");
    setBaseHoras(
      (colaborador as { base_horas_mes?: number | null }).base_horas_mes != null
        ? String((colaborador as { base_horas_mes?: number | null }).base_horas_mes)
        : "",
    );
    setBaseDias(
      (colaborador as { base_dias_mes?: number | null }).base_dias_mes != null
        ? String((colaborador as { base_dias_mes?: number | null }).base_dias_mes)
        : "",
    );
    setJustificativa("");
    setModo("continuidade");
    tocados.current = new Set();
  }, [open, colaborador]);


  // Jornada e equipe vêm da configuração de trabalho vigente.
  useEffect(() => {
    if (!open) return;
    if (!configAberta) {
      setTurnoPadraoId("");
      setCargaSemanal("");
      setFolgaVariavel(true);
      setDias(diasPadrao());
      setEquipeHabitual(true);
      return;
    }
    setTurnoPadraoId(configAberta.turno_padrao_id ?? "");
    setCargaSemanal(
      configAberta.carga_semanal_horas != null ? String(configAberta.carga_semanal_horas) : "",
    );
    setFolgaVariavel(configAberta.folga_variavel !== false);
    setEquipeHabitual(configAberta.compoe_equipe_habitual !== false);
    setDias(
      normalizarDias(
        (configAberta.dias ?? []).map((d) => ({
          dow: d.dow,
          trabalha: d.trabalha,
          turno_id: d.turno_id,
          entrada: d.entrada,
          saida: d.saida,
          intervalo_minutos: d.intervalo_minutos,
          setor_id: d.setor_id,
        })),
        null,
      ),
    );
  }, [open, configAberta]);

  // Benefícios atualmente ativos do colaborador entram marcados.
  useEffect(() => {
    if (!open) return;
    const ativos: Record<string, boolean> = {};
    const valores: Record<string, string> = {};
    atribuicoes
      .filter((a) => a.ativo !== false && !a.data_fim)
      .forEach((a) => {
        ativos[a.beneficio_id] = true;
        valores[a.beneficio_id] = a.valor != null ? String(a.valor) : "";
      });
    setBeneficiosSel(ativos);
    setBeneficiosValor(valores);
  }, [open, atribuicoes]);

  const policy = useMemo(() => contratoPolicy(regime), [regime]);
  const formasPermitidas = useMemo(() => formasPagamentoDoRegime(regime), [regime]);

  useEffect(() => {
    if (!formasPermitidas.includes(forma as never)) setForma(formasPermitidas[0]);
  }, [formasPermitidas, forma]);

  const setoresDaUnidade = useMemo(
    () => setores.filter((s) => !unidadeId || !s.unidade_id || s.unidade_id === unidadeId),
    [setores, unidadeId],
  );

  const cargoSelecionado = useMemo(
    () => (cargos as { id: string; nome: string; carga_horaria_semanal?: number | null }[])
      .find((c) => c.id === cargoId) ?? null,
    [cargos, cargoId],
  );

  // Referência de salário: piso do patronal da unidade ou ajuste da unidade.
  const pisosCargo = useDpCargoSalarios(cargoId || null);
  const patronalUnidade = unidadeId ? patronalPorUnidade.data?.[unidadeId] ?? null : null;
  const salarioCargo = useMemo(
    () =>
      salarioCargoNaUnidade(
        (pisosCargo.data ?? []) as never,
        unidadeId || null,
        patronalUnidade?.id ?? null,
        vigencia || undefined,
        { aceitarFuturo: true },
      ).valor,
    [pisosCargo.data, unidadeId, patronalUnidade?.id, vigencia],
  );

  // O sindicato do colaborador vem do cargo (enquadramento laboral).
  const enquadramento = useSindicatoDoCargo(cargoId || null, unidadeId || null);
  const sindicatoDoCargo = enquadramento.data?.laboral ?? null;
  const sindicatoTravado = !!cargoId && !!sindicatoDoCargo;

  useEffect(() => {
    if (sindicatoTravado && sindicatoDoCargo && sindicatoId !== sindicatoDoCargo.id) {
      setSindicatoId(sindicatoDoCargo.id);
    }
  }, [sindicatoTravado, sindicatoDoCargo, sindicatoId]);

  // Com salário do cargo cadastrado na unidade, o valor não é digitado aqui.
  const salarioTravado = !!cargoId && salarioCargo != null && forma === "mensalista";

  useEffect(() => {
    if (salarioTravado && salarioCargo != null) {
      const alvo = String(proporcional.salario ?? salarioCargo);
      if (salario !== alvo) setSalario(alvo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salarioTravado, salarioCargo, proporcional.salario]);

  // Padrão praticado pelos colaboradores já cadastrados nesse cargo.
  const cargoPadrao = useDpCargoPadrao(cargoId || null, unidadeId || null, colaborador?.id ?? null);

  useEffect(() => {
    const p = cargoPadrao.data;
    if (!open || !p || p.base === 0) return;
    const t = tocados.current;
    if (!t.has("regime") && p.regime) setRegime(p.regime);
    if (!t.has("setor") && p.setor_id) setSetorId(p.setor_id);
    if (!t.has("forma") && p.forma_pagamento) setForma(p.forma_pagamento);
    if (!t.has("turno") && p.turno_padrao_id) setTurnoPadraoId(p.turno_padrao_id);
    if (!t.has("carga") && p.carga_semanal_horas != null) {
      setCargaSemanal(String(p.carga_semanal_horas));
      if (!t.has("baseHoras")) setBaseHoras(String(baseHorasMesSugerida(p.carga_semanal_horas)));
    }
    if (!t.has("folga") && p.folga_variavel != null) setFolgaVariavel(p.folga_variavel);
    if (!t.has("dias") && p.dias && p.dias.length > 0) setDias(normalizarDias(p.dias, null));
    if (!t.has("beneficios") && p.beneficios.length > 0) {
      const sel: Record<string, boolean> = {};
      const val: Record<string, string> = {};
      p.beneficios.forEach((b) => {
        sel[b.beneficio_id] = true;
        if (b.valor != null) val[b.beneficio_id] = String(b.valor);
      });
      setBeneficiosSel((s) => ({ ...s, ...sel }));
      setBeneficiosValor((s) => ({ ...val, ...s }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cargoPadrao.data]);



  const proporcional = useMemo(
    () =>
      salarioProporcional({
        salarioCargo,
        cargaSemanal: num(cargaSemanal),
        cargaBaseCargo: cargoSelecionado?.carga_horaria_semanal ?? null,
        baseHorasMes: num(baseHoras) ?? baseHorasMesSugerida(num(cargaSemanal)),
      }),
    [salarioCargo, cargaSemanal, cargoSelecionado?.carga_horaria_semanal, baseHoras],
  );

  /** Preenche remuneração e base mensal com o resultado proporcional. */
  const aplicarProporcional = () => {
    if (proporcional.salario == null) {
      toast.error("Cadastre o salário do cargo nesta unidade para calcular a proporção.");
      return;
    }
    setBaseHoras(String(proporcional.baseHorasMes));
    if (forma === "mensalista") setSalario(String(proporcional.salario));
    else setValorHora(String(proporcional.valorHora));
    toast.success("Remuneração calculada pela jornada informada.");
  };

  const alterarDia = (dow: number, patch: Partial<DiaConfig>) =>
    setDias((ds) => ds.map((d) => (d.dow === dow ? { ...d, ...patch } : d)));

  const nome = (lista: { id: string; nome: string }[], id?: string | null) =>
    lista.find((i) => i.id === id)?.nome ?? null;

  const salvar = async () => {
    if (!vigencia) {
      toast.error("Informe a data em que a mudança passa a valer.");
      return;
    }
    if (justificativa.trim().length < 5) {
      toast.error("Explique brevemente o motivo da mudança.");
      return;
    }
    const beneficiosPayload: CondicaoBeneficioInput[] = beneficios.map((b) => ({
      beneficio_id: b.id,
      ativo: !!beneficiosSel[b.id],
      valor: num(beneficiosValor[b.id] ?? "") ?? b.valor_padrao ?? 0,
    }));

    try {
      await aplicar.mutateAsync({
        vigencia_inicio: vigencia,
        regime,
        forma_pagamento: forma,
        cargo_id: cargoId || null,
        unidade_id: unidadeId || null,
        setor_id: setorId || null,
        salario_base: forma === "mensalista" ? num(salario) : null,
        valor_hora: forma !== "mensalista" ? num(valorHora) : null,
        base_horas_mes: num(baseHoras),
        base_dias_mes: num(baseDias),
        turno_padrao_id: turnoPadraoId || null,
        carga_semanal_horas: num(cargaSemanal),
        folga_variavel: folgaVariavel,
        folga_fixa_dow: folgaVariavel ? null : dias.find((d) => !d.trabalha)?.dow ?? null,
        sindicato_id: sindicatoId || null,
        compoe_equipe_habitual: equipeHabitual,
        dias: dias.map((d) => ({
          dow: d.dow,
          trabalha: d.trabalha,
          turno_id: d.turno_id || null,
          entrada: d.entrada || null,
          saida: d.saida || null,
          intervalo_minutos: d.intervalo_minutos ?? null,
          setor_id: d.setor_id || null,
        })),
        beneficios: beneficiosPayload,
        justificativa: justificativa.trim(),
      });
      toast.success(`Novas condições valendo a partir de ${fmtDate(vigencia)}.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar a mudança.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[92vh] sm:rounded-lg">
        <DialogHeader className="border-b p-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5 text-primary" aria-hidden="true" />
            Alterar Condições de Trabalho
          </DialogTitle>
          <DialogDescription>
            O que você mudar aqui passa a valer na data informada. O que valia antes fica guardado no histórico de {colaborador?.nome ?? "o colaborador"}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cond-vigencia">A partir de</Label>
              <Input
                id="cond-vigencia"
                type="date"
                value={vigencia}
                onChange={(e) => setVigencia(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cond-justificativa">Motivo da mudança</Label>
              <Input
                id="cond-justificativa"
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Ex.: passou para jornada de 30 horas."
              />
            </div>
          </div>

          <Tabs value={aba} onValueChange={setAba}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="contrato">Contrato</TabsTrigger>
              <TabsTrigger value="jornada">Jornada</TabsTrigger>
              <TabsTrigger value="remuneracao">Pagamento</TabsTrigger>
              <TabsTrigger value="beneficios">Benefícios</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>

            {/* ---------------- Contrato ---------------- */}
            <TabsContent value="contrato" className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo de vínculo</Label>
                <Select value={regime} onValueChange={setRegime}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REGIMES.map((r) => (
                      <SelectItem key={r} value={r}>{contratoPolicy(r).label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cargo</Label>
                <Select value={cargoId} onValueChange={setCargoId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {cargos.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Unidade</Label>
                <Select
                  value={unidadeId}
                  onValueChange={(v) => {
                    setUnidadeId(v);
                    setSetorId("");
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {unidades.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Setor habitual</Label>
                <Select value={setorId} onValueChange={setSetorId}>
                  <SelectTrigger><SelectValue placeholder="Sem setor definido" /></SelectTrigger>
                  <SelectContent>
                    {setoresDaUnidade.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sindicato</Label>
                <Select value={sindicatoId} onValueChange={setSindicatoId}>
                  <SelectTrigger><SelectValue placeholder="Sem sindicato" /></SelectTrigger>
                  <SelectContent>
                    {sindicatos.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3 sm:col-span-2">
                <div>
                  <p className="text-sm font-medium">Faz parte da equipe habitual da unidade</p>
                  <p className="text-xs text-muted-foreground">
                    Desmarque quando a pessoa só atua como apoio ou cobertura.
                  </p>
                </div>
                <Switch checked={equipeHabitual} onCheckedChange={setEquipeHabitual} />
              </div>
            </TabsContent>

            {/* ---------------- Jornada ---------------- */}
            <TabsContent value="jornada" className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Turno padrão</Label>
                  <Select value={turnoPadraoId} onValueChange={setTurnoPadraoId}>
                    <SelectTrigger><SelectValue placeholder="Sem turno padrão" /></SelectTrigger>
                    <SelectContent>
                      {turnos.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.nome} · {String(t.entrada).slice(0, 5)}–{String(t.saida).slice(0, 5)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cond-carga">Horas por semana</Label>
                  <Input
                    id="cond-carga"
                    type="number"
                    min="0"
                    step="0.5"
                    value={cargaSemanal}
                    onChange={(e) => {
                      setCargaSemanal(e.target.value);
                      const sugerida = baseHorasMesSugerida(num(e.target.value));
                      setBaseHoras(String(sugerida));
                    }}
                    placeholder="Ex.: 30"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">Folga variável</p>
                    <p className="text-xs text-muted-foreground">Sem dia fixo de folga</p>
                  </div>
                  <Switch checked={folgaVariavel} onCheckedChange={setFolgaVariavel} />
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-sm font-medium">Dias e horários da semana</p>
                <p className="text-xs text-muted-foreground">
                  Deixe o horário em branco para seguir o turno. Preencha só quando o dia tiver horário próprio.
                </p>
                {dias.map((d) => (
                  <div key={d.dow} className="grid items-end gap-2 rounded-md border p-3 sm:grid-cols-[auto_1fr_1fr_1fr_1fr]">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={d.trabalha}
                        onCheckedChange={(v) => alterarDia(d.dow, { trabalha: v })}
                        aria-label={`Trabalha ${DOW_LABEL[d.dow]}`}
                      />
                      <span className="min-w-[92px] text-sm">{DOW_LABEL[d.dow]}</span>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Turno do dia</Label>
                      <Select
                        value={d.turno_id ?? "herdar"}
                        onValueChange={(v) => alterarDia(d.dow, { turno_id: v === "herdar" ? null : v })}
                        disabled={!d.trabalha}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="herdar">Turno padrão</SelectItem>
                          {turnos.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Entrada</Label>
                      <Input
                        type="time"
                        value={d.entrada ?? ""}
                        disabled={!d.trabalha}
                        onChange={(e) => alterarDia(d.dow, { entrada: e.target.value || null })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Saída</Label>
                      <Input
                        type="time"
                        value={d.saida ?? ""}
                        disabled={!d.trabalha}
                        onChange={(e) => alterarDia(d.dow, { saida: e.target.value || null })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Intervalo (min)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="5"
                        value={d.intervalo_minutos ?? ""}
                        disabled={!d.trabalha}
                        onChange={(e) =>
                          alterarDia(d.dow, {
                            intervalo_minutos: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* ---------------- Remuneração ---------------- */}
            <TabsContent value="remuneracao" className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Forma de pagamento</Label>
                  <Select value={forma} onValueChange={setForma}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {formasPermitidas.map((f) => (
                        <SelectItem key={f} value={f}>{FORMA_LABEL[f]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {forma === "mensalista" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="cond-salario">
                      {policy.remuneracaoSocietaria ? "Pró-labore do mês" : "Remuneração do mês"}
                    </Label>
                    <Input
                      id="cond-salario"
                      type="number"
                      min="0"
                      step="0.01"
                      value={salario}
                      onChange={(e) => setSalario(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="cond-hora">
                      {forma === "diarista" ? "Valor do dia" : "Valor da hora"}
                    </Label>
                    <Input
                      id="cond-hora"
                      type="number"
                      min="0"
                      step="0.01"
                      value={valorHora}
                      onChange={(e) => setValorHora(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="cond-base-horas">Horas base no mês</Label>
                  <Input
                    id="cond-base-horas"
                    type="number"
                    min="0"
                    step="1"
                    value={baseHoras}
                    onChange={(e) => setBaseHoras(e.target.value)}
                    placeholder="Ex.: 150"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cond-base-dias">Dias base no mês</Label>
                  <Input
                    id="cond-base-dias"
                    type="number"
                    min="0"
                    step="1"
                    value={baseDias}
                    onChange={(e) => setBaseDias(e.target.value)}
                    placeholder="Ex.: 30"
                  />
                </div>
              </div>

              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-sm font-medium">Cálculo pela jornada</p>
                <p className="mt-1 text-sm text-muted-foreground">{proporcional.explicacao}</p>
                {salarioCargo != null ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Salário do cargo nesta unidade: {fmtMoeda(salarioCargo)}
                    {proporcional.parcial ? " (jornada parcial)" : ""}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={aplicarProporcional}
                >
                  <Calculator className="mr-2 h-4 w-4" aria-hidden="true" />
                  Usar este valor
                </Button>
              </div>
            </TabsContent>

            {/* ---------------- Benefícios ---------------- */}
            <TabsContent value="beneficios" className="mt-4 space-y-2">
              {beneficios.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum benefício cadastrado na empresa ainda.
                </p>
              ) : (
                beneficios.map((b) => (
                  <div key={b.id} className="grid items-center gap-2 rounded-md border p-3 sm:grid-cols-[1fr_auto_140px]">
                    <div>
                      <p className="text-sm font-medium">{b.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        Valor padrão {fmtMoeda(b.valor_padrao)}
                      </p>
                    </div>
                    <Switch
                      checked={!!beneficiosSel[b.id]}
                      onCheckedChange={(v) =>
                        setBeneficiosSel((s) => ({ ...s, [b.id]: v }))
                      }
                      aria-label={`Conceder ${b.nome}`}
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={beneficiosValor[b.id] ?? ""}
                      disabled={!beneficiosSel[b.id]}
                      placeholder={String(b.valor_padrao ?? 0)}
                      onChange={(e) =>
                        setBeneficiosValor((s) => ({ ...s, [b.id]: e.target.value }))
                      }
                    />
                  </div>
                ))
              )}
            </TabsContent>

            {/* ---------------- Histórico ---------------- */}
            <TabsContent value="historico" className="mt-4 space-y-2">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : historico.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma mudança registrada ainda. A primeira que você salvar aparece aqui.
                </p>
              ) : (
                <ul className="space-y-2">
                  {historico.map((h) => (
                    <li key={h.id} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {fmtDate(h.vigencia_inicio)} → {h.vigencia_fim ? fmtDate(h.vigencia_fim) : "atual"}
                        </Badge>
                        {h.regime ? <span>{contratoPolicy(h.regime).label}</span> : null}
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {[
                          nome(cargos as { id: string; nome: string }[], h.cargo_id),
                          nome(unidades as { id: string; nome: string }[], h.unidade_id),
                          nome(setores as { id: string; nome: string }[], h.setor_id),
                          nome(sindicatos as { id: string; nome: string }[], h.sindicato_id),
                          h.carga_semanal_horas != null ? `${h.carga_semanal_horas}h por semana` : null,
                          fmtMoeda(h.salario_base) ?? (h.valor_hora ? `${fmtMoeda(h.valor_hora)} / hora` : null),
                        ]
                          .filter(Boolean)
                          .join(" • ") || "Sem detalhes registrados"}
                      </p>
                      {h.justificativa ? (
                        <p className="mt-1 text-xs text-muted-foreground">Motivo: {h.justificativa}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>

        </div>

        <DialogFooter className="flex-row gap-2 border-t p-4">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={salvar} disabled={aplicar.isPending}>
            {aplicar.isPending ? "Salvando…" : "Aplicar mudança"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
