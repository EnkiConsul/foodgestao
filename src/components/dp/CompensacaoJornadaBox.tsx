import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useDpColaboradorConfigTrabalho } from "@/hooks/useDpColaboradorConfigTrabalho";
import { detalharCargaSemanal, DOW_LABEL, type ConfigTrabalho, type TurnoResolvido } from "@/lib/dp/config-trabalho";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import {
  diasAcimaDe8h, emitirTermoCompensacao, termoCompensacaoExistente, TERMOS_COMPENSACAO, type TermoCompensacaoTipo,
} from "@/lib/dp/termos-compensacao";

interface Props {
  companyId: string;
  colaboradorId: string;
  nome: string;
  cpf?: string | null;
  unidade?: { nome?: string | null; banco_horas?: boolean | null; compensa_feriados?: boolean | null; compensacao_feriado_antecedencia_dias?: number | null } | null;
}

/** Sugere e emite os acordos de compensação conforme a jornada e as regras da unidade. */
export function CompensacaoJornadaBox({ companyId, colaboradorId, nome, cpf, unidade }: Props) {
  const qc = useQueryClient();
  const cfg = useDpColaboradorConfigTrabalho(colaboradorId);
  const [emitindo, setEmitindo] = useState<TermoCompensacaoTipo | null>(null);

  const turnos = useQuery({
    queryKey: ["dp_turnos_resolvidos", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("dp_turnos").select("id, nome, entrada, saida, intervalo_minutos").eq("company_id", companyId);
      return (data ?? []) as unknown as TurnoResolvido[];
    },
  });

  const acima = useMemo(() => {
    const v = cfg.vigente;
    if (!v) return [];
    const config: ConfigTrabalho = {
      turno_padrao_id: v.turno_padrao_id, folga_variavel: v.folga_variavel, folga_fixa_dow: v.folga_fixa_dow,
      dias: v.dias as unknown as ConfigTrabalho["dias"],
    };
    return diasAcimaDe8h(detalharCargaSemanal(config, turnos.data ?? []));
  }, [cfg.vigente, turnos.data]);

  const tipos: TermoCompensacaoTipo[] = [
    ...(acima.length ? (["semanal"] as const) : []),
    ...(unidade?.banco_horas ? (["banco_horas"] as const) : []),
    ...(unidade?.compensa_feriados ? (["feriados"] as const) : []),
  ];

  const status = useQuery({
    queryKey: ["dp_termos_compensacao", colaboradorId, tipos.join(",")],
    enabled: tipos.length > 0,
    queryFn: async () => {
      const r: Partial<Record<TermoCompensacaoTipo, { assinado: boolean } | null>> = {};
      for (const t of tipos) r[t] = await termoCompensacaoExistente(colaboradorId, t);
      return r;
    },
  });

  if (!tipos.length) return null;

  const emitir = async (tipo: TermoCompensacaoTipo) => {
    setEmitindo(tipo);
    try {
      const horarios = tipo === "semanal"
        ? (cfg.vigente?.dias ?? []).filter((d) => d.trabalha).map((d) => `${DOW_LABEL[d.dow]}: ${d.entrada ?? "turno"}${d.saida ? ` às ${d.saida}` : ""}`)
        : undefined;
      const r = await emitirTermoCompensacao({ tipo, companyId, colaboradorId, nome, cpf, horarios });
      toast.success(r === "emitido" ? "Termo enviado para assinatura no portal do colaborador." : "Este termo já foi emitido.");
      qc.invalidateQueries({ queryKey: ["dp_termos_compensacao", colaboradorId] });
    } catch (e: any) {
      toast.error("Não foi possível gerar o termo", { description: e?.message ?? "Tente novamente em instantes." });
    } finally {
      setEmitindo(null);
    }
  };

  const motivo: Record<TermoCompensacaoTipo, string> = {
    semanal: `Jornada acima de 8h em ${acima.map((d) => `${DOW_LABEL[d.dow]} (${formatarHoras(d.minutos / 60)})`).join(", ")}. A CLT (art. 59, § 6º) pede acordo de compensação semanal.`,
    banco_horas: `A unidade${unidade?.nome ? ` ${unidade.nome}` : ""} adota banco de horas.`,
    feriados: `A unidade adota compensação de feriados (pedido com ${unidade?.compensacao_feriado_antecedencia_dias ?? 2} dia(s) de antecedência).`,
  };

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-border p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <FileSignature className="h-4 w-4 text-primary" /> Acordos de Compensação
      </p>
      {tipos.map((t) => {
        const s = status.data?.[t];
        return (
          <div key={t} className="space-y-1.5 rounded-lg bg-muted/40 p-2.5">
            <p className="text-sm font-medium">{TERMOS_COMPENSACAO[t].titulo}</p>
            <p className="text-xs text-muted-foreground">{motivo[t]}</p>
            {s ? (
              <p className="flex items-center gap-1.5 text-xs font-medium">
                {s.assinado ? (
                  <><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Assinado — salvo na aba Documentos.</>
                ) : (
                  <><Clock className="h-3.5 w-3.5 text-muted-foreground" /> Aguardando assinatura no portal.</>
                )}
              </p>
            ) : (
              <Button type="button" size="sm" disabled={!!emitindo || status.isLoading} onClick={() => emitir(t)}>
                {emitindo === t ? "Gerando..." : "Gerar Termo para Assinatura"}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
