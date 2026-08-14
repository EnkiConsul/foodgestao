import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  formaPagamentoOptions,
  valeTransporteDoMes,
  type FormaPagamento,
} from "@/lib/dp/remuneracao";
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
};

export const numeroBR = (v: string): number => {
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

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
  const salario = numeroBR(value.salario_base) || salarioCargo || 0;
  const vt = valeTransporteDoMes(
    {
      vale_transporte: value.vale_transporte,
      vale_transporte_valor_dia: numeroBR(value.vale_transporte_valor_dia),
      salario_base: salario,
    },
  );

  const labelValor =
    forma === "horista" ? "Valor da hora *" : forma === "diarista" ? "Valor do dia *" : "Salário base *";

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
              onChange={(e) => onChange({ valor_hora: e.target.value })}
              placeholder="Ex: 18,50"
            />
          ) : (
            <Input
              inputMode="decimal"
              value={value.salario_base}
              onChange={(e) => onChange({ salario_base: e.target.value })}
              placeholder={salarioCargo ? `Cargo: ${formatarBRL(salarioCargo)}` : "Ex: 2200,00"}
            />
          )}
          {forma !== "horista" && salarioCargo ? (
            <p className="text-[11px] text-muted-foreground">
              Em branco, a folha usa o salário do cargo ({formatarBRL(salarioCargo)}).
            </p>
          ) : null}
        </div>

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
