import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calculator, PencilLine } from "lucide-react";
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
  alertasBeneficioAlimentacao, DESCONTO_TIPO_LABEL, DIAS_BASE_PADRAO, PERIODICIDADE_LABEL,
  type DescontoTipo, type Periodicidade,
} from "@/lib/dp/beneficios-regras";
import { AlertTriangle, Info } from "lucide-react";
import type { Beneficio } from "@/hooks/useDpBeneficios";
import { formatarBRL } from "@/lib/dp/folha";

export interface RemuneracaoFormState {
  forma_pagamento: FormaPagamento;
  salario_base: string;
  valor_hora: string;
  dependentes_irrf: string;
  adicional_percentual: string;
  vale_transporte: boolean;
  vale_transporte_valor_dia: string;
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
  /** Prêmio em valor fixo ou percentual do salário. */
  premio_assiduidade_tipo: PremioTipo;
  /** Vale-alimentação / refeição. */
  vale_alimentacao: boolean;
  vale_alimentacao_valor: string;
  vale_alimentacao_periodicidade: Periodicidade;
  vale_alimentacao_dias_base: string;
  vale_alimentacao_desconto_tipo: DescontoTipo;
  vale_alimentacao_desconto_valor: string;
}

export const remuneracaoBlank: RemuneracaoFormState = {
  forma_pagamento: "mensalista",
  salario_base: "",
  valor_hora: "",
  dependentes_irrf: "0",
  adicional_percentual: "0",
  vale_transporte: false,
  vale_transporte_valor_dia: "",
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
  premio_assiduidade_tipo: "valor",
  vale_alimentacao: false,
  vale_alimentacao_valor: "",
  vale_alimentacao_periodicidade: "mensal",
  vale_alimentacao_dias_base: String(DIAS_BASE_PADRAO),
  vale_alimentacao_desconto_tipo: "percentual",
  vale_alimentacao_desconto_valor: "1",
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
  /** Insalubridade/periculosidade marcada no cargo. */
  cargoInsalubre?: boolean;
  beneficios: Beneficio[];
  cargoInsalubreHint?: string;
  /** Regime do vínculo — restringe as formas de pagamento admitidas. */
  regime?: string | null;
}

/**
 * Bloco "Remuneração e benefícios" do cadastro do colaborador —
 * dados obrigatórios para a folha nascer com valor correto.
 */
export function RemuneracaoFields({
  value,
  onChange,
  salarioCargo,
  cargoInsalubre,
  beneficios,
  regime,
}: Props) {
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

  const premioCalculado = premioAssiduidadeBase(
    {
      premio_assiduidade_tipo: value.premio_assiduidade_tipo,
      premio_assiduidade_valor: numeroBR(value.premio_assiduidade_valor),
    },
    salario,
  );

  const vaInput = {
    vale_alimentacao: value.vale_alimentacao,
    vale_alimentacao_valor: numeroBR(value.vale_alimentacao_valor),
    vale_alimentacao_periodicidade: value.vale_alimentacao_periodicidade,
    vale_alimentacao_dias_base: numeroBR(value.vale_alimentacao_dias_base),
    vale_alimentacao_desconto_tipo: value.vale_alimentacao_desconto_tipo,
    vale_alimentacao_desconto_valor: numeroBR(value.vale_alimentacao_desconto_valor),
  };
  const va = valeAlimentacaoDoMes(vaInput);
  const alertasVa = value.vale_alimentacao
    ? alertasBeneficioAlimentacao({
      valor: vaInput.vale_alimentacao_valor,
      periodicidade: vaInput.vale_alimentacao_periodicidade,
      dias_base: vaInput.vale_alimentacao_dias_base,
      desconto_tipo: vaInput.vale_alimentacao_desconto_tipo,
      desconto_valor: vaInput.vale_alimentacao_desconto_valor,
    })
    : [];


  const labelValor =
    forma === "horista" ? "Valor da hora *" : forma === "diarista" ? "Valor do dia *" : "Salário base *";
  const bloqueiaValor = usaBase && !value.valor_hora_manual && calculado != null;

  return (
    <div className="col-span-2 space-y-4 rounded-xl border border-border bg-muted/20 p-3">
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
              className={bloqueiaValor ? "bg-muted/60" : undefined}
              onChange={(e) => onChange({ valor_hora: e.target.value })}
              placeholder="Ex: 18,50"
            />
          ) : (
            <Input
              inputMode="decimal"
              value={value.salario_base}
              readOnly={bloqueiaValor}
              className={bloqueiaValor ? "bg-muted/60" : undefined}
              onChange={(e) => onChange({ salario_base: e.target.value })}
              placeholder={salarioCargo ? `Cargo: ${formatarBRL(salarioCargo)}` : "Ex: 2200,00"}
            />
          )}
          {forma === "mensalista" && salarioCargo ? (
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

        <div className="space-y-2">
          <Label>Adicional insalubridade/periculosidade (%)</Label>
          <Input
            inputMode="decimal"
            value={value.adicional_percentual}
            onChange={(e) => onChange({ adicional_percentual: e.target.value })}
            placeholder="0"
          />
          {cargoInsalubre ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-500">
              O cargo está marcado como insalubre/periculoso — informe o percentual devido.
            </p>
          ) : null}
        </div>
      </div>

      {/* Assiduidade e pontualidade */}
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
            <p className="text-[11px] text-muted-foreground md:col-span-2">
              O prêmio é pago quando o critério é cumprido no mês. Faltas sempre cancelam o benefício.
            </p>
          </div>
        )}
      </div>

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
                onChange={(e) => onChange({ vale_transporte_valor_dia: e.target.value })}
                placeholder="Ex: 10,40"
              />
            </div>
            <div className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
              <div>Concedido no mês (22 dias): <strong className="text-foreground">{formatarBRL(vt.bruto)}</strong></div>
              <div>Desconto legal (até 6%): <strong className="text-foreground">{formatarBRL(vt.desconto)}</strong></div>
            </div>
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
                  <Label>Quantidade de dias</Label>
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
                          <span className="text-muted-foreground"> — {resumoJornada}</span>
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
            <div className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground md:col-span-2">
              <div>Concedido no mês: <strong className="text-foreground">{formatarBRL(va.bruto)}</strong></div>
              <div>Desconto do colaborador: <strong className="text-foreground">{formatarBRL(va.desconto)}</strong></div>
              <div>Custo da empresa: <strong className="text-foreground">{formatarBRL(va.liquido)}</strong></div>
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
      {beneficios.length > 0 && (
        <div className="space-y-2">
          <Label>Benefícios</Label>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {beneficios.map((b) => (
              <label
                key={b.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-background p-2 text-sm"
              >
                <Checkbox
                  checked={!!value.beneficios[b.id]}
                  onCheckedChange={(v) =>
                    onChange({ beneficios: { ...value.beneficios, [b.id]: v === true } })
                  }
                />
                <span className="min-w-0 flex-1 truncate">{b.nome}</span>
                <span className="text-xs text-muted-foreground">{formatarBRL(Number(b.valor_padrao ?? 0))}</span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Os benefícios marcados passam a valer a partir de hoje e entram automaticamente na folha.
          </p>
        </div>
      )}
    </div>
  );
}
