import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GRAUS_INSALUBRIDADE,
  PERICULOSIDADE_PERCENTUAL_LEGAL,
  alertasAdicionaisRisco,
} from "@/lib/dp/adicionais-risco";
import { numeroBR } from "@/components/dp/RemuneracaoFields";

interface Props {
  insalubridade: string;
  periculosidade: string;
  onChange: (patch: { insalubridade?: string; periculosidade?: string }) => void;
  /** O cargo está marcado como insalubre/perigoso (gera alerta se faltar percentual). */
  cargoInsalubre?: boolean;
  cargoPerigoso?: boolean;
}

/**
 * Percentuais de insalubridade e periculosidade — os mesmos campos usados na
 * ficha do colaborador, aqui como padrão do cargo. Não cumulam (art. 193 §2º).
 */
export function CargoRiscosFields({
  insalubridade,
  periculosidade,
  onChange,
  cargoInsalubre,
  cargoPerigoso,
}: Props) {
  const alertas = alertasAdicionaisRisco({
    insalubridade: numeroBR(insalubridade),
    periculosidade: numeroBR(periculosidade),
    cargoInsalubre,
    cargoPerigoso,
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cargo-insalubridade">Insalubridade (%)</Label>
          <Input
            id="cargo-insalubridade"
            inputMode="decimal"
            value={insalubridade}
            onChange={(e) => onChange({ insalubridade: e.target.value })}
            placeholder="0"
          />
          <div className="flex flex-wrap gap-1.5">
            {GRAUS_INSALUBRIDADE.map((g) => (
              <Button
                key={g.percentual}
                type="button"
                size="sm"
                variant={numeroBR(insalubridade) === g.percentual ? "secondary" : "outline"}
                className="h-7 text-[11px]"
                onClick={() => onChange({ insalubridade: String(g.percentual) })}
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
          <Label htmlFor="cargo-periculosidade">Periculosidade (%)</Label>
          <Input
            id="cargo-periculosidade"
            inputMode="decimal"
            value={periculosidade}
            onChange={(e) => onChange({ periculosidade: e.target.value })}
            placeholder="0"
          />
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={
                numeroBR(periculosidade) === PERICULOSIDADE_PERCENTUAL_LEGAL ? "secondary" : "outline"
              }
              className="h-7 text-[11px]"
              onClick={() => onChange({ periculosidade: String(PERICULOSIDADE_PERCENTUAL_LEGAL) })}
            >
              Percentual legal (30%)
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Calculado sobre o salário base.</p>
        </div>
      </div>

      {alertas.map((a, i) => (
        <p
          key={`${a.tipo}-${i}`}
          className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-500"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{a.mensagem}</span>
        </p>
      ))}
    </div>
  );
}
