import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calculator, PencilLine, Pencil, Plus } from "lucide-react";
import {
  formaPagamentoOptions,
  valeTransporteDoMes,
  valorHoraPorBase,
  valorDiaPorBase,
  BASES_HORAS_MES,
  ASSIDUIDADE_CRITERIO_OPTIONS,
  PREMIO_TIPO_LABEL,
  premioAssiduidadeBase,
  valeAlimentacaoDoMes,
  type FormaPagamento,
  type AssiduidadeCriterio,
  type PremioTipo,
} from "@/lib/dp/remuneracao";
import {
  alertasBeneficioAlimentacao, DESCONTO_TIPO_LABEL, DIAS_BASE_PADRAO, DIAS_ORIGEM_LABEL,
  PERIODICIDADE_LABEL, descreverBaseSimulacao, descreverDiasJornada, diasSimuladosMesComercial,
  type DescontoTipo, type DiaSemanaTrabalho, type DiasOrigem, type DivergenciaIsonomia,
  type Periodicidade,
} from "@/lib/dp/beneficios-regras";
import { BeneficioIsonomiaAviso } from "@/components/dp/BeneficioIsonomiaAviso";
import { ValeCorteFields } from "@/components/dp/beneficios/ValeCorteFields";
import { beneficioAlcanca, descreverEscopoBeneficio } from "@/lib/dp/beneficioEscopo";


import { useDpSalarioFamiliaConfig } from "@/hooks/useDpSalarioFamiliaConfig";
import { AlertTriangle, Info } from "lucide-react";
import type { Beneficio } from "@/hooks/useDpBeneficios";
import { formatarBRL } from "@/lib/dp/folha";
import {
  GRAUS_INSALUBRIDADE, PERICULOSIDADE_PERCENTUAL_LEGAL, alertasAdicionaisRisco,
  simularAdicionalPercentual,
} from "@/lib/dp/adicionais-risco";


import { cn } from "@/lib/utils";
import {
  DIA_PAGAMENTO_PADRAO,
  DIAS_CORTE_PADRAO,
  REGRAS_DESCONTO_PADRAO,
  periodoVaDe,
} from "@/lib/dp/va-calculo";

/** dd/MM a partir de uma data ISO, sem depender de fuso. */
const formatarDataCurta = (isoData: string) => {
  const [, m, d] = isoData.split("-");
  return `${d}/${m}`;
};


export interface RemuneracaoFormState {
  forma_pagamento: FormaPagamento;
  salario_base: string;
  valor_hora: string;
  dependentes_irrf: string;
  adicional_percentual: string;
  /** Adicionais de risco — não cumuláveis (art. 193 §2º CLT). */
  insalubridade_percentual: string;
  periculosidade_percentual: string;
  vale_transporte: boolean;
  vale_transporte_valor_dia: string;
  /** Dia do mês em que o VT é depositado (vazio = padrão da empresa). */
  vale_transporte_dia_pagamento: string;
  /** Dias de antecedência do corte do VT. */
  vale_transporte_dias_corte: string;
  /** O que faz perder o dia de VT no próximo depósito. */
  vale_transporte_desconta_falta: boolean;
  vale_transporte_desconta_folga_extra: boolean;
  vale_transporte_desconta_atestado: boolean;
  vale_transporte_desconta_ferias: boolean;
  beneficios: Record<string, boolean>;
  /** Base de cálculo (para horistas/diaristas: base salarial ÷ base de horas/dias). */
  base_salarial: string;
  base_horas_mes: string;
  base_dias_mes: string;
  valor_hora_manual: boolean;
  /** Assiduidade e pontualidade. */
  premio_assiduidade: boolean;
  premio_assiduidade_valor: string;
  assiduidade_criterio: AssiduidadeCriterio;
  assiduidade_tolerancia_min: string;
  assiduidade_max_atrasos: string;
  /** Atestado também faz perder o prêmio (regra sindical comum). */
  assiduidade_considera_atestado: boolean;
  /** Atestados tolerados no mês antes de perder o prêmio. */
  assiduidade_max_atestados: string;
  /** Prêmio em valor fixo ou percentual do salário. */
  premio_assiduidade_tipo: PremioTipo;
  /** Vale-alimentação / refeição. */
  vale_alimentacao: boolean;
  vale_alimentacao_valor: string;
  vale_alimentacao_periodicidade: Periodicidade;
  vale_alimentacao_dias_base: string;
  /** Origem dos dias no mês para o VA pago por dia. */
  vale_alimentacao_dias_origem: DiasOrigem;
  vale_alimentacao_desconto_tipo: DescontoTipo;
  vale_alimentacao_desconto_valor: string;
  /** Dia do mês em que o VA é depositado (vazio = padrão da empresa). */
  vale_alimentacao_dia_pagamento: string;
  /** Dias de antecedência do corte, para a empresa se organizar. */
  vale_alimentacao_dias_corte: string;
  /** O que faz perder o dia de VA no próximo depósito. */
  vale_alimentacao_desconta_falta: boolean;
  vale_alimentacao_desconta_folga_extra: boolean;
  vale_alimentacao_desconta_atestado: boolean;
  vale_alimentacao_desconta_ferias: boolean;
}

export const remuneracaoBlank: RemuneracaoFormState = {
  forma_pagamento: "mensalista",
  salario_base: "",
  valor_hora: "",
  dependentes_irrf: "0",
  adicional_percentual: "0",
  insalubridade_percentual: "0",
  periculosidade_percentual: "0",
  vale_transporte: false,
  vale_transporte_valor_dia: "",
  vale_transporte_dia_pagamento: String(DIA_PAGAMENTO_PADRAO),
  vale_transporte_dias_corte: String(DIAS_CORTE_PADRAO),
  vale_transporte_desconta_falta: REGRAS_DESCONTO_PADRAO.falta,
  vale_transporte_desconta_folga_extra: REGRAS_DESCONTO_PADRAO.folga_extra,
  vale_transporte_desconta_atestado: REGRAS_DESCONTO_PADRAO.atestado,
  vale_transporte_desconta_ferias: REGRAS_DESCONTO_PADRAO.ferias,
  beneficios: {},
  base_salarial: "",
  base_horas_mes: "220",
  base_dias_mes: "30",
  valor_hora_manual: false,
  premio_assiduidade: false,
  premio_assiduidade_valor: "",
  assiduidade_criterio: "sem_faltas_sem_atrasos",
  assiduidade_tolerancia_min: "10",
  assiduidade_max_atrasos: "2",
  assiduidade_considera_atestado: true,
  assiduidade_max_atestados: "0",
  premio_assiduidade_tipo: "valor",
  vale_alimentacao: false,
  vale_alimentacao_valor: "",
  vale_alimentacao_periodicidade: "mensal",
  vale_alimentacao_dias_base: String(DIAS_BASE_PADRAO),
  vale_alimentacao_dias_origem: "jornada",
  vale_alimentacao_desconto_tipo: "percentual",
  vale_alimentacao_desconto_valor: "1",
  vale_alimentacao_dia_pagamento: String(DIA_PAGAMENTO_PADRAO),
  vale_alimentacao_dias_corte: String(DIAS_CORTE_PADRAO),
  vale_alimentacao_desconta_falta: REGRAS_DESCONTO_PADRAO.falta,
  vale_alimentacao_desconta_folga_extra: REGRAS_DESCONTO_PADRAO.folga_extra,
  vale_alimentacao_desconta_atestado: REGRAS_DESCONTO_PADRAO.atestado,
  vale_alimentacao_desconta_ferias: REGRAS_DESCONTO_PADRAO.ferias,
};

export const numeroBR = (v: string): number => {
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const paraBR = (v: number) => v.toFixed(2).replace(".", ",");

interface Props {
  value: RemuneracaoFormState;
  onChange: (patch: Partial<RemuneracaoFormState>) => void;
  /** Salário do cargo selecionado, usado como referência/placeholder. */
  salarioCargo?: number | null;
  /** Nome do cargo selecionado — usado na explicação do salário travado. */
  cargoNome?: string | null;
  /** Executado antes de navegar para o cadastro de cargos (fecha o diálogo). */
  onBeforeNavigate?: () => void;
  /** Insalubridade marcada no cargo. */
  cargoInsalubre?: boolean;
  /** Periculosidade marcada no cargo. */
  cargoPerigoso?: boolean;
  beneficios: Beneficio[];
  /** Abre o cadastro de um novo benefício do catálogo a partir desta tela. */
  onNovoBeneficio?: () => void;
  /** Abre o cadastro do benefício do catálogo para edição. */
  onEditarBeneficio?: (b: Beneficio) => void;
  /** Unidade e cargo do colaborador — define quais benefícios do catálogo valem. */
  escopoAlvo?: { unidade_id?: string | null; cargo_id?: string | null };
  nomeUnidade?: (id?: string | null) => string | null;
  nomeCargo?: (id?: string | null) => string | null;


  cargoInsalubreHint?: string;
  /** Regime do vínculo — restringe as formas de pagamento admitidas. */
  regime?: string | null;
  /** Dias da semana da jornada do colaborador (aba Horário de Trabalho). */
  diasJornada?: DiaSemanaTrabalho[] | null;
  /** Folgas de fim de semana por mês (DSR da unidade/empresa). */
  folgasFimDeSemanaMes?: number | null;
  /** Campo pendente sinalizado pela validação do formulário. */
  campoErro?: string | null;
  /** Divergências de isonomia deste cadastro contra o grupo equivalente. */
  isonomia?: DivergenciaIsonomia[];
  /** Iguala o benefício ao padrão do grupo. */
  onAplicarPadraoIsonomia?: (d: DivergenciaIsonomia) => void;

}

/**
 * Bloco "Remuneração e benefícios" do cadastro do colaborador —
 * dados obrigatórios para a folha nascer com valor correto.
 */
export function RemuneracaoFields({
  value,
  onChange,
  salarioCargo,
  cargoNome,
  onBeforeNavigate,
  cargoInsalubre,
  cargoPerigoso,
  beneficios,
  onNovoBeneficio,
  onEditarBeneficio,
  escopoAlvo,
  nomeUnidade,
  nomeCargo,


  regime,
  diasJornada,
  folgasFimDeSemanaMes,
  campoErro,
  isonomia,
  onAplicarPadraoIsonomia,
}: Props) {
  const navigate = useNavigate();

  /** Marca o input pendente para foco/destaque automático. */
  const marca = (campo: string, extraClass?: string) => ({
    "data-field": campo,
    "aria-invalid": campoErro === campo ? true : undefined,
    className: cn(extraClass, campoErro === campo && "border-destructive ring-1 ring-destructive"),
  });



  const forma = value.forma_pagamento;
  const formaOptions = formaPagamentoOptions(regime);
  const usaBase = forma === "horista" || forma === "diarista";
  const baseSalarial = numeroBR(value.base_salarial);
  const calculado =
    forma === "horista"
      ? valorHoraPorBase(baseSalarial, numeroBR(value.base_horas_mes))
      : valorDiaPorBase(baseSalarial, numeroBR(value.base_dias_mes));

  // Enquanto o administrador não sobrepõe, o valor da hora/dia acompanha a base.
  useEffect(() => {
    if (!usaBase || value.valor_hora_manual || calculado == null) return;
    const alvo = paraBR(calculado);
    if (forma === "horista") {
      if (value.valor_hora !== alvo) onChange({ valor_hora: alvo });
    } else if (value.salario_base !== alvo) {
      onChange({ salario_base: alvo });
    }
  }, [usaBase, value.valor_hora_manual, calculado, forma]);

  const salario = numeroBR(value.salario_base) || salarioCargo || 0;
  const vt = valeTransporteDoMes(
    {
      vale_transporte: value.vale_transporte,
      vale_transporte_valor_dia: numeroBR(value.vale_transporte_valor_dia),
      salario_base: salario,
    },
  );

  // Base mensal do adicional: no horista/diarista o campo de valor guarda a
  // hora/o dia, então a referência mensal é a base salarial informada.
  const baseMensalRisco = usaBase ? baseSalarial : salario;
  const simulacaoPericulosidade = simularAdicionalPercentual({
    percentual: numeroBR(value.periculosidade_percentual),
    baseMensal: baseMensalRisco,
    valorDia: forma === "diarista" ? numeroBR(value.salario_base) : null,
    valorHora: forma === "horista" ? numeroBR(value.valor_hora) : null,
  });
  /** "R$ x/mês · R$ y por dia trabalhado", conforme a forma de pagamento. */
  const resumoPericulosidade = [
    simulacaoPericulosidade.mes != null ? `${formatarBRL(simulacaoPericulosidade.mes)}/mês` : null,
    simulacaoPericulosidade.porDia != null
      ? `${formatarBRL(simulacaoPericulosidade.porDia)} por dia trabalhado`
      : null,
    simulacaoPericulosidade.porHora != null
      ? `${formatarBRL(simulacaoPericulosidade.porHora)} por hora`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const alertasRisco = alertasAdicionaisRisco({
    insalubridade: numeroBR(value.insalubridade_percentual),
    periculosidade: numeroBR(value.periculosidade_percentual),
    cargoInsalubre: !!cargoInsalubre,
    cargoPerigoso: !!cargoPerigoso,
  });

  const premioCalculado = premioAssiduidadeBase(
    {
      premio_assiduidade_tipo: value.premio_assiduidade_tipo,
      premio_assiduidade_valor: numeroBR(value.premio_assiduidade_valor),
    },
    salario,
  );

  // Dias simulados no mês: 30 dias − folgas semanais × 4 − folgas de fim de semana.
  const diasJornadaMes = diasSimuladosMesComercial({ dias: diasJornada, folgasFimDeSemanaMes });
  const resumoJornada = descreverDiasJornada(diasJornada);
  const baseSimulacao = descreverBaseSimulacao({ dias: diasJornada, folgasFimDeSemanaMes });


  const vaInput = {
    vale_alimentacao: value.vale_alimentacao,
    vale_alimentacao_valor: numeroBR(value.vale_alimentacao_valor),
    vale_alimentacao_periodicidade: value.vale_alimentacao_periodicidade,
    vale_alimentacao_dias_base: numeroBR(value.vale_alimentacao_dias_base),
    vale_alimentacao_dias_origem: value.vale_alimentacao_dias_origem,
    vale_alimentacao_desconto_tipo: value.vale_alimentacao_desconto_tipo,
    vale_alimentacao_desconto_valor: numeroBR(value.vale_alimentacao_desconto_valor),
  };
  const va = valeAlimentacaoDoMes(vaInput, { diasJornada: diasJornadaMes });
  const hoje = new Date();
  const periodoVa = periodoVaDe(
    Number(value.vale_alimentacao_dia_pagamento) || DIA_PAGAMENTO_PADRAO,
    value.vale_alimentacao_dias_corte === "" ? DIAS_CORTE_PADRAO : Number(value.vale_alimentacao_dias_corte),
    `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`,
  );

  const alertasVa = value.vale_alimentacao
    ? alertasBeneficioAlimentacao({
      valor: vaInput.vale_alimentacao_valor,
      periodicidade: vaInput.vale_alimentacao_periodicidade,
      dias_base: va.dias,
      desconto_tipo: vaInput.vale_alimentacao_desconto_tipo,
      desconto_valor: vaInput.vale_alimentacao_desconto_valor,
    })
    : [];


  const labelValor =
    forma === "horista" ? "Valor da hora *" : forma === "diarista" ? "Valor do dia *" : "Salário base *";
  const bloqueiaValor = usaBase && !value.valor_hora_manual && calculado != null;
  // Um cargo = um salário: mensalista com cargo remunerado não edita o valor aqui.
  const salarioDoCargo = forma === "mensalista" && !!salarioCargo && salarioCargo > 0;
  const travadoPeloCargo = salarioDoCargo;

  // Cargo remunerado manda no salário do mensalista: espelhamos o valor no campo.
  useEffect(() => {
    if (!travadoPeloCargo || salarioCargo == null) return;
    const alvo = paraBR(salarioCargo);
    if (value.salario_base !== alvo) onChange({ salario_base: alvo });
  }, [travadoPeloCargo, salarioCargo, value.salario_base]);

  /**
   * Horista/diarista sem base salarial informada abre com o salário de
   * referência do cargo (piso do patronal ou ajuste da unidade). Nada é
   * gravado sem salvar — o aviso pede a confirmação do valor.
   */
  const prefillRef = useRef(false);
  const [prefillSugerido, setPrefillSugerido] = useState(false);
  useEffect(() => {
    if (!usaBase || prefillRef.current) return;
    if (!salarioCargo || salarioCargo <= 0) return;
    if (numeroBR(value.base_salarial) > 0) { prefillRef.current = true; return; }
    prefillRef.current = true;
    setPrefillSugerido(true);
    onChange({ base_salarial: paraBR(salarioCargo) });
  }, [usaBase, salarioCargo, value.base_salarial]);

  return (
    <div className="md:col-span-2 space-y-4 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Remuneração e benefícios</div>
        <Badge variant="outline" className="text-[10px]">Obrigatório para a folha</Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Forma de pagamento *</Label>
          <Select
            value={forma}
            onValueChange={(v: FormaPagamento) => onChange({ forma_pagamento: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {formaOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{labelValor}</Label>
          {forma === "horista" ? (
            <Input
              inputMode="decimal"
              value={value.valor_hora}
              readOnly={bloqueiaValor}
              {...marca("valor_hora", bloqueiaValor ? "bg-muted/60" : undefined)}
              onChange={(e) => onChange({ valor_hora: e.target.value })}
              placeholder="Ex: 18,50"
            />
          ) : (
            <Input
              inputMode="decimal"
              value={value.salario_base}
              readOnly={bloqueiaValor || travadoPeloCargo}
              {...marca("salario_base", bloqueiaValor || travadoPeloCargo ? "bg-muted/60" : undefined)}
              onChange={(e) => onChange({ salario_base: e.target.value })}
              placeholder={salarioCargo ? `Cargo: ${formatarBRL(salarioCargo)}` : "Ex: 2200,00"}
            />
          )}

          {travadoPeloCargo ? (
            <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              <span>
                Valor definido pelo cargo{cargoNome ? ` ${cargoNome}` : ""} ({formatarBRL(salarioCargo!)}).
              </span>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-[11px]"
                onClick={() => {
                  onBeforeNavigate?.();
                  navigate("/dp/cadastros/cargos");
                }}
              >
                Alterar no cargo
              </Button>
            </div>
          ) : forma === "mensalista" && salarioCargo ? (
            <p className="text-[11px] text-muted-foreground">
              Em branco, a folha usa o salário do cargo ({formatarBRL(salarioCargo)}).
            </p>
          ) : null}
        </div>

        {/* Base de cálculo — facilita o cadastro de intermitentes e horistas */}
        {usaBase && (
          <div className="space-y-3 rounded-lg border border-border bg-background p-3 md:col-span-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Calculator className="h-4 w-4 text-primary" aria-hidden="true" />
              Base de cálculo {forma === "horista" ? "da hora" : "do dia"}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Base salarial (mês)</Label>
                <Input
                  inputMode="decimal"
                  value={value.base_salarial}
                  onChange={(e) => onChange({ base_salarial: e.target.value })}
                  placeholder="Ex: 2200,00"
                />
                {prefillSugerido && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-500">
                    Sugerido pelo cargo{cargoNome ? ` ${cargoNome}` : ""} ({formatarBRL(salarioCargo!)}) — confirme o valor e salve.
                  </p>
                )}
              </div>
              {forma === "horista" ? (
                <div className="space-y-2">
                  <Label>Base de horas / mês</Label>
                  <Select
                    value={value.base_horas_mes}
                    onValueChange={(v) => onChange({ base_horas_mes: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BASES_HORAS_MES.map((h) => (
                        <SelectItem key={h} value={String(h)}>{h} horas</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Base de dias / mês</Label>
                  <Input
                    inputMode="numeric"
                    value={value.base_dias_mes}
                    onChange={(e) => onChange({ base_dias_mes: e.target.value.replace(/\D/g, "") })}
                    placeholder="30"
                  />
                </div>
              )}
              <div className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                <div>{forma === "horista" ? "Valor da hora" : "Valor do dia"} calculado</div>
                <div className="text-base font-semibold tabular-nums text-foreground">
                  {calculado != null ? formatarBRL(calculado) : "—"}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                {value.valor_hora_manual
                  ? "Valor informado manualmente — a base fica apenas como referência."
                  : `Informe a base salarial e o sistema calcula automaticamente o ${forma === "horista" ? "valor da hora" : "valor do dia"}.`}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => onChange({ valor_hora_manual: !value.valor_hora_manual })}
              >
                <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                {value.valor_hora_manual ? "Voltar ao cálculo automático" : "Usar valor manual"}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Dependentes (IRRF)</Label>
          <Input
            inputMode="numeric"
            value={value.dependentes_irrf}
            onChange={(e) => onChange({ dependentes_irrf: e.target.value.replace(/\D/g, "") })}
            placeholder="0"
          />
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-background p-3 md:col-span-2">
          <div className="text-sm font-medium">Adicionais de risco</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Insalubridade (%)</Label>
              <Input
                inputMode="decimal"
                value={value.insalubridade_percentual}
                {...marca("insalubridade_percentual")}
                onChange={(e) => onChange({ insalubridade_percentual: e.target.value })}
                placeholder="0"
              />
              <div className="flex flex-wrap gap-1.5">
                {GRAUS_INSALUBRIDADE.map((g) => (
                  <Button
                    key={g.percentual}
                    type="button"
                    size="sm"
                    variant={numeroBR(value.insalubridade_percentual) === g.percentual ? "secondary" : "outline"}
                    className="h-7 text-[11px]"
                    onClick={() => onChange({ insalubridade_percentual: String(g.percentual) })}
                  >
                    {g.label}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Calculado sobre o salário mínimo (art. 192 da CLT).
              </p>
            </div>

            <div className="space-y-2">
              <Label>Periculosidade (%)</Label>
              <Input
                inputMode="decimal"
                value={value.periculosidade_percentual}
                {...marca("periculosidade_percentual")}
                onChange={(e) => onChange({ periculosidade_percentual: e.target.value })}
                placeholder="0"
              />
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={
                    numeroBR(value.periculosidade_percentual) === PERICULOSIDADE_PERCENTUAL_LEGAL
                      ? "secondary"
                      : "outline"
                  }
                  className="h-7 text-[11px]"
                  onClick={() => onChange({ periculosidade_percentual: String(PERICULOSIDADE_PERCENTUAL_LEGAL) })}
                >
                  Percentual legal (30%)
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Calculado sobre o salário base
                {resumoPericulosidade ? ` — ${resumoPericulosidade}` : ""}
                .

              </p>
            </div>
          </div>

          {alertasRisco.map((a, i) => (
            <p
              key={`${a.tipo}-${i}`}
              className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-500"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{a.mensagem}</span>
            </p>
          ))}
        </div>

      </div>

      {/* Assiduidade e pontualidade — desligada quando a empresa não usa o prêmio */}
      {assiduidadeAtiva && (
        <div className="space-y-3 rounded-lg border border-border bg-background p-3">
          <div className="flex items-center gap-3">
            <Switch
              id="premio_assiduidade"
              checked={value.premio_assiduidade}
              onCheckedChange={(v) => onChange({ premio_assiduidade: v })}
            />
            <Label htmlFor="premio_assiduidade" className="cursor-pointer">
              Prêmio de assiduidade e pontualidade
            </Label>
          </div>
          {value.premio_assiduidade && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Forma do prêmio</Label>
                <Select
                  value={value.premio_assiduidade_tipo}
                  onValueChange={(v: PremioTipo) => onChange({ premio_assiduidade_tipo: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PREMIO_TIPO_LABEL) as PremioTipo[]).map((t) => (
                      <SelectItem key={t} value={t}>{PREMIO_TIPO_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  {value.premio_assiduidade_tipo === "percentual" ? "Percentual do salário (%)" : "Valor mensal"}
                </Label>
                <Input
                  inputMode="decimal"
                  value={value.premio_assiduidade_valor}
                  {...marca("premio_assiduidade_valor")}

                  onChange={(e) => onChange({ premio_assiduidade_valor: e.target.value })}
                  placeholder={value.premio_assiduidade_tipo === "percentual" ? "Ex: 5" : "Ex: 150,00"}
                />
                {value.premio_assiduidade_tipo === "percentual" && premioCalculado > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Equivale a <strong className="text-foreground">{formatarBRL(premioCalculado)}</strong> por mês.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Critério</Label>
                <Select
                  value={value.assiduidade_criterio}
                  onValueChange={(v: AssiduidadeCriterio) => onChange({ assiduidade_criterio: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSIDUIDADE_CRITERIO_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tolerância de atraso (min/dia)</Label>
                <Input
                  inputMode="numeric"
                  value={value.assiduidade_tolerancia_min}
                  onChange={(e) => onChange({ assiduidade_tolerancia_min: e.target.value.replace(/\D/g, "") })}
                  placeholder="10"
                />
              </div>
              <div className="space-y-2">
                <Label>Máximo de atrasos no mês</Label>
                <Input
                  inputMode="numeric"
                  value={value.assiduidade_max_atrasos}
                  onChange={(e) => onChange({ assiduidade_max_atrasos: e.target.value.replace(/\D/g, "") })}
                  placeholder="2"
                />
                <p className="text-[11px] text-muted-foreground">
                  Limite definido pela empresa — 0 exige pontualidade integral no mês.
                </p>
              </div>
              <div className="space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3 md:col-span-2">
                <div className="flex items-center gap-3">
                  <Switch
                    id="assiduidade_considera_atestado"
                    checked={value.assiduidade_considera_atestado}
                    onCheckedChange={(v) => onChange({ assiduidade_considera_atestado: v })}
                  />
                  <Label htmlFor="assiduidade_considera_atestado" className="cursor-pointer">
                    Atestado também faz perder o prêmio
                  </Label>
                </div>
                {value.assiduidade_considera_atestado && (
                  <div className="space-y-2">
                    <Label>Atestados tolerados no mês</Label>
                    <Input
                      inputMode="numeric"
                      className="max-w-[160px]"
                      value={value.assiduidade_max_atestados}
                      onChange={(e) => onChange({ assiduidade_max_atestados: e.target.value.replace(/\D/g, "") })}
                      placeholder="0"
                    />
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Muitas convenções tiram o prêmio quando há atestado. A empresa pode
                  abonar caso a caso na apuração da folha, mantendo o prêmio do mês.
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground md:col-span-2">
                O prêmio é pago quando o critério é cumprido no mês. Faltas sempre cancelam o benefício.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Isonomia: divergências contra o grupo sindical/cargo equivalente */}
      <BeneficioIsonomiaAviso divergencias={isonomia ?? []} onAplicarPadrao={onAplicarPadraoIsonomia} />

      {/* Vale-transporte */}
      <div className="space-y-3 rounded-lg border border-border bg-background p-3">
        <div className="flex items-center gap-3">
          <Switch
            id="vale_transporte"
            checked={value.vale_transporte}
            onCheckedChange={(v) => onChange({ vale_transporte: v })}
          />
          <Label htmlFor="vale_transporte" className="cursor-pointer">Opta pelo vale-transporte</Label>
        </div>
        {value.vale_transporte && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Valor por dia</Label>
              <Input
                inputMode="decimal"
                value={value.vale_transporte_valor_dia}
                {...marca("vale_transporte_valor_dia")}

                onChange={(e) => onChange({ vale_transporte_valor_dia: e.target.value })}
                placeholder="Ex: 10,40"
              />
            </div>
            <div className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
              <div>Concedido no mês (22 dias): <strong className="text-foreground">{formatarBRL(vt.bruto)}</strong></div>
              <div>Desconto legal (até 6%): <strong className="text-foreground">{formatarBRL(vt.desconto)}</strong></div>
            </div>
            <ValeCorteFields
              id="vt"
              valor={{
                diaPagamento: value.vale_transporte_dia_pagamento,
                diasCorte: value.vale_transporte_dias_corte,
                regras: {
                  falta: value.vale_transporte_desconta_falta,
                  folga_extra: value.vale_transporte_desconta_folga_extra,
                  atestado: value.vale_transporte_desconta_atestado,
                  ferias: value.vale_transporte_desconta_ferias,
                },
              }}
              onChange={(patch) =>
                onChange({
                  ...(patch.diaPagamento !== undefined
                    ? { vale_transporte_dia_pagamento: patch.diaPagamento }
                    : {}),
                  ...(patch.diasCorte !== undefined
                    ? { vale_transporte_dias_corte: patch.diasCorte }
                    : {}),
                  ...(patch.regras
                    ? {
                        vale_transporte_desconta_falta: patch.regras.falta,
                        vale_transporte_desconta_folga_extra: patch.regras.folga_extra,
                        vale_transporte_desconta_atestado: patch.regras.atestado,
                        vale_transporte_desconta_ferias: patch.regras.ferias,
                      }
                    : {}),
                })
              }
            />
          </div>
        )}
      </div>

      {/* Vale-alimentação / refeição */}
      <div className="space-y-3 rounded-lg border border-border bg-background p-3">
        <div className="flex items-center gap-3">
          <Switch
            id="vale_alimentacao"
            checked={value.vale_alimentacao}
            onCheckedChange={(v) => onChange({ vale_alimentacao: v })}
          />
          <Label htmlFor="vale_alimentacao" className="cursor-pointer">
            Vale-alimentação / refeição
          </Label>
        </div>
        {value.vale_alimentacao && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Periodicidade</Label>
              <Select
                value={value.vale_alimentacao_periodicidade}
                onValueChange={(v: Periodicidade) => onChange({ vale_alimentacao_periodicidade: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PERIODICIDADE_LABEL) as Periodicidade[]).map((t) => (
                    <SelectItem key={t} value={t}>{PERIODICIDADE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                {value.vale_alimentacao_periodicidade === "diario" ? "Valor por dia" : "Valor por mês"}
              </Label>
              <Input
                inputMode="decimal"
                value={value.vale_alimentacao_valor}
                {...marca("vale_alimentacao_valor")}

                onChange={(e) => onChange({ vale_alimentacao_valor: e.target.value })}
                placeholder="Ex: 25,00"
              />
            </div>
            {value.vale_alimentacao_periodicidade === "diario" && (
              <>
                <div className="space-y-2">
                  <Label>Dias considerados no mês</Label>
                  <Select
                    value={value.vale_alimentacao_dias_origem}
                    onValueChange={(v: DiasOrigem) => onChange({ vale_alimentacao_dias_origem: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(DIAS_ORIGEM_LABEL) as DiasOrigem[]).map((t) => (
                        <SelectItem key={t} value={t}>{DIAS_ORIGEM_LABEL[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>
                    {value.vale_alimentacao_dias_origem === "fixo" ? "Quantidade de dias" : "Dias simulados no mês"}
                  </Label>
                  {value.vale_alimentacao_dias_origem === "fixo" ? (
                    <Input
                      inputMode="numeric"
                      value={value.vale_alimentacao_dias_base}
                      onChange={(e) => onChange({ vale_alimentacao_dias_base: e.target.value.replace(/\D/g, "") })}
                      placeholder={String(DIAS_BASE_PADRAO)}
                    />
                  ) : (
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                      {diasJornadaMes != null ? (
                        <>
                          <strong>{diasJornadaMes} dias</strong>
                          <span className="text-muted-foreground"> — {baseSimulacao} · {resumoJornada}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          Cadastre o Horário de Trabalho para calcular os dias (usando {DIAS_BASE_PADRAO} como referência).
                        </span>
                      )}
                    </div>
                  )}
                </div>

              </>
            )}

            <div className="space-y-2">
              <Label>Desconto do colaborador</Label>
              <Select
                value={value.vale_alimentacao_desconto_tipo}
                onValueChange={(v: DescontoTipo) => onChange({ vale_alimentacao_desconto_tipo: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(DESCONTO_TIPO_LABEL) as DescontoTipo[]).map((t) => (
                    <SelectItem key={t} value={t}>{DESCONTO_TIPO_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {value.vale_alimentacao_desconto_tipo !== "nenhum" && (
              <div className="space-y-2">
                <Label>
                  {value.vale_alimentacao_desconto_tipo === "percentual"
                    ? "Percentual descontado (%)"
                    : "Valor descontado (R$)"}
                </Label>
                <Input
                  inputMode="decimal"
                  value={value.vale_alimentacao_desconto_valor}
                  onChange={(e) => onChange({ vale_alimentacao_desconto_valor: e.target.value })}
                  placeholder={value.vale_alimentacao_desconto_tipo === "percentual" ? "1" : "20,00"}
                />
              </div>
            )}
            <ValeCorteFields
              id="va"
              valor={{
                diaPagamento: value.vale_alimentacao_dia_pagamento,
                diasCorte: value.vale_alimentacao_dias_corte,
                regras: {
                  falta: value.vale_alimentacao_desconta_falta,
                  folga_extra: value.vale_alimentacao_desconta_folga_extra,
                  atestado: value.vale_alimentacao_desconta_atestado,
                  ferias: value.vale_alimentacao_desconta_ferias,
                },
              }}
              onChange={(patch) =>
                onChange({
                  ...(patch.diaPagamento !== undefined
                    ? { vale_alimentacao_dia_pagamento: patch.diaPagamento }
                    : {}),
                  ...(patch.diasCorte !== undefined
                    ? { vale_alimentacao_dias_corte: patch.diasCorte }
                    : {}),
                  ...(patch.regras
                    ? {
                        vale_alimentacao_desconta_falta: patch.regras.falta,
                        vale_alimentacao_desconta_folga_extra: patch.regras.folga_extra,
                        vale_alimentacao_desconta_atestado: patch.regras.atestado,
                        vale_alimentacao_desconta_ferias: patch.regras.ferias,
                      }
                    : {}),
                })
              }
            />

            <div className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground md:col-span-2">
              <div className="font-medium text-foreground">
                {value.vale_alimentacao_periodicidade === "diario" ? "Simulação do mês" : "Valor do mês"}
              </div>
              {value.vale_alimentacao_periodicidade === "diario" && (
                <div>
                  Conta: {formatarBRL(numeroBR(value.vale_alimentacao_valor))} × {va.dias} dias{" "}
                  ({va.diasOrigem === "jornada"
                    ? baseSimulacao
                    : va.diasOrigem === "fixo"
                      ? "quantidade fixa"
                      : "referência padrão"})
                </div>
              )}
              <div>Concedido no mês: <strong className="text-foreground">{formatarBRL(va.bruto)}</strong></div>
              <div>Desconto do colaborador: <strong className="text-foreground">{formatarBRL(va.desconto)}</strong></div>
              <div>Custo da empresa: <strong className="text-foreground">{formatarBRL(va.liquido)}</strong></div>
              {value.vale_alimentacao_periodicidade === "diario" && (
                <p>
                  Este total é uma <strong className="text-foreground">simulação</strong>. O valor efetivo sai na
                  folha, pelos dias realmente trabalhados no ponto.
                </p>
              )}
            </div>


            {alertasVa.map((a) => (
              <p
                key={a.codigo}
                className={`flex items-start gap-2 rounded-md border p-2 text-[11px] md:col-span-2 ${
                  a.severidade === "aviso"
                    ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
                    : "bg-muted/30 text-muted-foreground"
                }`}
              >
                {a.severidade === "aviso"
                  ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                <span>
                  <strong className="block text-foreground">{a.titulo}</strong>
                  {a.mensagem}
                  {a.recomendacao && <span className="mt-0.5 block">{a.recomendacao}</span>}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Benefícios da empresa */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Benefícios</Label>
          {onNovoBeneficio && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-9 w-full sm:w-auto"
              onClick={() => onNovoBeneficio()}
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Novo benefício
            </Button>
          )}
        </div>

        {beneficios.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            Nenhum benefício no catálogo da empresa. Crie o primeiro para poder vinculá-lo a este
            colaborador — ele entra automaticamente na folha.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {beneficios.map((b) => {
                const alcanca = beneficioAlcanca(b as any, escopoAlvo ?? {});
                const escopoTexto = descreverEscopoBeneficio(b as any, {
                  unidade: nomeUnidade?.((b as any).unidade_id) ?? null,
                  cargo: nomeCargo?.((b as any).cargo_id) ?? null,
                });
                return (
                  <div
                    key={b.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border border-border bg-background p-2 text-sm",
                      !alcanca && "opacity-60",
                    )}
                    title={alcanca ? undefined : `Disponível só para ${escopoTexto}`}
                  >
                    <label className="flex min-w-0 flex-1 items-center gap-2">
                      <Checkbox
                        disabled={!alcanca}
                        checked={!!value.beneficios[b.id]}
                        onCheckedChange={(v) =>
                          onChange({ beneficios: { ...value.beneficios, [b.id]: v === true } })
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{b.nome}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {alcanca ? escopoTexto : `Só para ${escopoTexto}`}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatarBRL(Number(b.valor_padrao ?? 0))}
                      </span>
                    </label>
                    {onEditarBeneficio && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 shrink-0"
                        title="Editar benefício do catálogo"
                        aria-label={`Editar benefício ${b.nome}`}
                        onClick={() => onEditarBeneficio(b)}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Os benefícios marcados passam a valer a partir de hoje e entram automaticamente na folha.
              Benefícios de outra unidade ou cargo aparecem esmaecidos.
            </p>
          </>
        )}

      </div>

    </div>
  );
}
