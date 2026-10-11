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
  PREMIO_TIPO_LABEL,
  premioAssiduidadeBase,
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
            <Label>Tolerância diária de atraso (min)</Label>
            <Input
              inputMode="numeric"
              value={value.assiduidade_tolerancia_min}
              onChange={(e) => onChange({ assiduidade_tolerancia_min: e.target.value.replace(/\D/g, "") })}
              placeholder="Ex: 10"
            />
            <p className="text-[11px] text-muted-foreground">
              Soma o atraso da entrada e do retorno do intervalo no mesmo dia.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Máximo de atrasos no mês</Label>
            <Input
              inputMode="numeric"
              value={value.assiduidade_max_atrasos}
              onChange={(e) => onChange({ assiduidade_max_atrasos: e.target.value.replace(/\D/g, "") })}
              placeholder="Ex: 2"
            />
            <p className="text-[11px] text-muted-foreground">
              Só contam os dias acima da tolerância. Passou do máximo, vai para decisão do gestor.
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground md:col-span-2">
            Em cada falta, atestado, licença ou atraso acima do limite o gestor decide se
            mantém ou perde o prêmio, partindo do padrão do sistema.
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
  void unidade;
  const partes = [
    v.premio_assiduidade_tipo === "percentual" ? `${valor}% do salário` : `R$ ${valor}/mês`,
    `tolerância ${v.assiduidade_tolerancia_min || "10"} min/dia`,
    `até ${v.assiduidade_max_atrasos || "2"} atraso(s)`,
  ];
  return partes.join(" · ") + " · decisão do gestor por evento";
}
