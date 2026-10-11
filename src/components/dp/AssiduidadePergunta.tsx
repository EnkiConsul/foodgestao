import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  exigeJustificativaAssiduidade,
  padraoAssiduidade,
  premioAssiduidadeAplicavel,
  type EventoAssiduidade,
} from "@/lib/dp/assiduidade-risco";

export interface DecisaoAssiduidade {
  perde: boolean;
  justificativa: string;
}

/** A pergunta só existe se a pessoa tem prêmio de assiduidade cadastrado. */
export function usePremioAssiduidade(colaboradorId?: string | null) {
  return useQuery({
    queryKey: ["dp_premio_assiduidade", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("premio_assiduidade, premio_assiduidade_valor, vinculo_label")
        .eq("id", colaboradorId!)
        .maybeSingle();
      if (error) throw error;
      return premioAssiduidadeAplicavel(data as never);
    },
  });
}

/** Decisão válida para salvar: null quando não se aplica. Lança se faltar justificativa. */
export function validarDecisaoAssiduidade(
  evento: EventoAssiduidade,
  decisao: DecisaoAssiduidade | null,
): DecisaoAssiduidade | null {
  if (!decisao) return null;
  if (exigeJustificativaAssiduidade(evento, decisao.perde) && !decisao.justificativa.trim()) {
    throw new Error("Informe a justificativa para mudar o padrão do prêmio de assiduidade.");
  }
  return { perde: decisao.perde, justificativa: decisao.justificativa.trim() };
}

interface Props {
  colaboradorId?: string | null;
  evento: EventoAssiduidade;
  value: DecisaoAssiduidade | null;
  onChange: (v: DecisaoAssiduidade | null) => void;
}

/** Pergunta do prêmio de assiduidade em cada evento, já com o padrão do sistema. */
export function AssiduidadePergunta({ colaboradorId, evento, value, onChange }: Props) {
  const premio = usePremioAssiduidade(colaboradorId);
  const padrao = padraoAssiduidade(evento);
  const aplicavel = !!premio.data && padrao !== null;

  useEffect(() => {
    if (!aplicavel) {
      if (value !== null) onChange(null);
      return;
    }
    onChange({ perde: padrao as boolean, justificativa: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aplicavel, evento, colaboradorId]);

  if (!aplicavel || !value) return null;
  const mudou = exigeJustificativaAssiduidade(evento, value.perde);

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
      <Label>Este evento mantém o prêmio de assiduidade deste período?</Label>
      <RadioGroup
        value={value.perde ? "perde" : "mantem"}
        onValueChange={(v) => onChange({ ...value, perde: v === "perde" })}
        className="flex flex-wrap gap-4"
      >
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <RadioGroupItem value="mantem" /> Sim, manter{padrao === false ? " (padrão)" : ""}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <RadioGroupItem value="perde" /> Não, perder{padrao === true ? " (padrão)" : ""}
        </label>
      </RadioGroup>
      {mudou && (
        <div className="space-y-1">
          <Label className="text-xs">Justificativa *</Label>
          <Textarea
            rows={2}
            value={value.justificativa}
            onChange={(e) => onChange({ ...value, justificativa: e.target.value })}
            placeholder="Por que esta decisão é diferente do padrão?"
          />
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        O padrão vem do sistema; a decisão fica registrada no histórico da ocorrência.
      </p>
    </div>
  );
}
