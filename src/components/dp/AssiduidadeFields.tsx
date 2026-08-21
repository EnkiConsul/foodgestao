// ------------------------------------------------------------------
// Domínio: DP → Prêmio de assiduidade e pontualidade.
//
// Mesmos campos usados na aba Remuneração da ficha do colaborador e no card
// "Prêmio de Assiduidade" em Cargos e Salários → Complementos Salariais.
// Componente único para as duas telas nunca divergirem.
// ------------------------------------------------------------------

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ASSIDUIDADE_CRITERIO_OPTIONS,
  PREMIO_TIPO_LABEL,
  premioAssiduidadeBase,
  type AssiduidadeCriterio,
  type PremioTipo,
} from "@/lib/dp/remuneracao";
import { formatarBRL } from "@/lib/dp/folha";
import { numeroBR, type RemuneracaoFormState } from "@/components/dp/RemuneracaoFields";

/** Só os campos de assiduidade do formulário de remuneração. */
export type AssiduidadeFormState = Pick<
  RemuneracaoFormState,
  | "premio_assiduidade"
  | "premio_assiduidade_valor"
  | "premio_assiduidade_tipo"
  | "assiduidade_criterio"
  | "assiduidade_tolerancia_min"
  | "assiduidade_max_atrasos"
  | "assiduidade_considera_atestado"
  | "assiduidade_max_atestados"
>;

interface Props {
  value: AssiduidadeFormState;
  onChange: (patch: Partial<AssiduidadeFormState>) => void;
  /** Salário de referência da prévia quando o prêmio é percentual. */
  salarioReferencia?: number;
  /** Prefixo dos ids, para não colidir quando há dois formulários na tela. */
  idPrefix?: string;
  /** Destaque/foco de campo pendente (usado na ficha do colaborador). */
  campoProps?: (campo: string) => Record<string, unknown>;
}

export function AssiduidadeFields({
  value,
  onChange,
  salarioReferencia = 0,
  idPrefix = "assid",
  campoProps,
}: Props) {
  const premioCalculado = premioAssiduidadeBase(
    {
      premio_assiduidade_tipo: value.premio_assiduidade_tipo,
      premio_assiduidade_valor: numeroBR(value.premio_assiduidade_valor),
    },
    salarioReferencia,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Switch
          id={`${idPrefix}_premio`}
          checked={value.premio_assiduidade}
          onCheckedChange={(v) => onChange({ premio_assiduidade: v })}
        />
        <Label htmlFor={`${idPrefix}_premio`} className="cursor-pointer">
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
              {...(campoProps?.("premio_assiduidade_valor") ?? {})}
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
                id={`${idPrefix}_considera_atestado`}
                checked={value.assiduidade_considera_atestado}
                onCheckedChange={(v) => onChange({ assiduidade_considera_atestado: v })}
              />
              <Label htmlFor={`${idPrefix}_considera_atestado`} className="cursor-pointer">
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
              abonar caso a caso na apuração, mantendo o prêmio do mês.
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground md:col-span-2">
            O prêmio é pago quando o critério é cumprido no mês. Faltas sempre cancelam o benefício.
          </p>
        </div>
      )}
    </div>
  );
}

/** Resumo de uma linha das regras de assiduidade, para cards de listagem. */
export function resumoAssiduidade(v: Partial<AssiduidadeFormState> | undefined | null): string {
  if (!v || !v.premio_assiduidade) return "Sem prêmio configurado";
  const unidade = v.premio_assiduidade_tipo === "percentual" ? "%" : "R$";
  const valor = v.premio_assiduidade_valor || "0";
  const criterio = ASSIDUIDADE_CRITERIO_OPTIONS.find((o) => o.value === v.assiduidade_criterio)?.label;
  const partes = [
    v.premio_assiduidade_tipo === "percentual" ? `${valor}% do salário` : `R$ ${valor}/mês`,
  ];
  if (criterio) partes.push(criterio);
  if (v.assiduidade_tolerancia_min) partes.push(`tolerância ${v.assiduidade_tolerancia_min} min`);
  if (v.assiduidade_max_atrasos) partes.push(`até ${v.assiduidade_max_atrasos} atraso(s)`);
  if (v.assiduidade_considera_atestado)
    partes.push(`atestado desconta (até ${v.assiduidade_max_atestados || "0"})`);
  void unidade;
  return partes.join(" · ");
}
