import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DIA_PAGAMENTO_PADRAO,
  DIAS_CORTE_PADRAO,
  periodoVaDe,
  type RegrasDescontoVa,
} from "@/lib/dp/va-calculo";

const dataCurta = (isoData: string) => {
  const [, m, d] = isoData.split("-");
  return `${d}/${m}`;
};

export interface ValeCorteValor {
  diaPagamento: string;
  diasCorte: string;
  regras: RegrasDescontoVa;
}

interface Props {
  /** Prefixo dos ids, para VA e VT coexistirem na mesma tela. */
  id: string;
  valor: ValeCorteValor;
  onChange: (patch: Partial<ValeCorteValor>) => void;
}

const REGRAS: readonly [keyof RegrasDescontoVa, string][] = [
  ["falta", "Falta"],
  ["folga_extra", "Folga extra"],
  ["atestado", "Atestado/licença"],
  ["ferias", "Férias"],
];

/**
 * Dia do depósito, data de corte e regras de desconto do dia — usado tanto no
 * vale-alimentação quanto no vale-transporte. O que fica em branco herda o
 * padrão da empresa (empresa → unidade → cargo → colaborador).
 */
export function ValeCorteFields({ id, valor, onChange }: Props) {
  const hoje = new Date();
  const competencia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
  const periodo = periodoVaDe(
    Number(valor.diaPagamento) || DIA_PAGAMENTO_PADRAO,
    valor.diasCorte === "" ? DIAS_CORTE_PADRAO : Number(valor.diasCorte),
    competencia,
  );

  const soDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 2);

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3 md:col-span-2">
      <div>
        <p className="text-sm font-medium">Depósito e data de corte</p>
        <p className="text-xs text-muted-foreground">
          O cálculo fecha alguns dias antes do pagamento para a empresa se organizar. O depósito
          cobre os dias previstos do próximo período, menos os dias pagos e não trabalhados no
          período anterior. Em branco, vale o padrão da empresa (empresa → unidade → cargo →
          colaborador).
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}_dia_pagamento`}>Dia do pagamento</Label>
          <Input
            id={`${id}_dia_pagamento`}
            inputMode="numeric"
            value={valor.diaPagamento}
            onChange={(e) => onChange({ diaPagamento: soDigitos(e.target.value) })}
            placeholder={String(DIA_PAGAMENTO_PADRAO)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}_dias_corte`}>Corte (dias antes do pagamento)</Label>
          <Input
            id={`${id}_dias_corte`}
            inputMode="numeric"
            value={valor.diasCorte}
            onChange={(e) => onChange({ diasCorte: soDigitos(e.target.value) })}
            placeholder={String(DIAS_CORTE_PADRAO)}
          />
        </div>
      </div>
      <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
        Pagamento em {dataCurta(periodo.pagamento)} · corte em {dataCurta(periodo.corte)} · cobre{" "}
        {dataCurta(periodo.cobertura.inicio)} a {dataCurta(periodo.cobertura.fim)} · confere{" "}
        {dataCurta(periodo.conferencia.inicio)} a {dataCurta(periodo.conferencia.fim)}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Desconta o dia em caso de
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {REGRAS.map(([campo, label]) => (
            <div key={campo} className="flex items-center gap-3">
              <Switch
                id={`${id}_${campo}`}
                checked={valor.regras[campo]}
                onCheckedChange={(v) => onChange({ regras: { ...valor.regras, [campo]: v } })}
              />
              <Label htmlFor={`${id}_${campo}`} className="cursor-pointer text-sm font-normal">
                {label}
              </Label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
