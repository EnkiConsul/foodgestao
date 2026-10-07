import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useDpColaboradorConfigTrabalho } from "@/hooks/useDpColaboradorConfigTrabalho";
import { detalharCargaSemanal, DOW_LABEL, type ConfigTrabalho, type TurnoResolvido } from "@/lib/dp/config-trabalho";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import { TermoCompensacaoPreviaDialog } from "@/components/dp/TermoCompensacaoPreviaDialog";
import { cpfFmt } from "@/lib/dp/termos-freelancer";
import { toUpperCadastro } from "@/lib/text/upperCadastro";
import type { LinhaJornada } from "@/lib/dp/termo-compensacao-pdf";
import {
  diasAcimaDe8h, termoCompensacaoExistente, TERMOS_COMPENSACAO, vinculoAdmiteCompensacao, type TermoCompensacaoTipo,
} from "@/lib/dp/termos-compensacao";

interface Props {
  companyId: string;
  colaboradorId: string;
  nome: string;
  cpf?: string | null;
  regime?: string | null;
  cargoId?: string | null;
  vinculoLabel?: string | null;
  unidade?: { nome?: string | null; banco_horas?: boolean | null; compensa_feriados?: boolean | null; compensacao_feriado_antecedencia_dias?: number | null } | null;
}

/** Sugere e emite os acordos de compensação conforme a jornada e as regras da unidade. */
export function CompensacaoJornadaBox({ companyId, colaboradorId, nome, cpf, regime, cargoId, vinculoLabel, unidade }: Props) {
  const qc = useQueryClient();
  const cfg = useDpColaboradorConfigTrabalho(colaboradorId);

  const turnos = useQuery({
    queryKey: ["dp_turnos_resolvidos", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("dp_turnos").select("id, nome, entrada, saida, intervalo_minutos").eq("company_id", companyId);
      return (data ?? []) as unknown as TurnoResolvido[];
    },
  });

  const extras = useQuery({
    queryKey: ["dp_termo_comp_extras", companyId, cargoId ?? null],
    queryFn: async () => {
      const { data: emp } = await supabase.from("companies").select("name, trade_name, cnpj").eq("id", companyId).maybeSingle();
      let cargo: string | null = null;
      if (cargoId) {
        const { data: c } = await supabase.from("dp_cargos").select("nome").eq("id", cargoId).maybeSingle();
        cargo = (c as { nome?: string } | null)?.nome ?? null;
      }
      return { empresa: (emp?.name || emp?.trade_name || "Empresa").toUpperCase(), cnpj: emp?.cnpj ?? null, cargo };
    },
  });

  const detalhes = useMemo(() => {
    const v = cfg.vigente;
    if (!v) return [];
    const config: ConfigTrabalho = {
      turno_padrao_id: v.turno_padrao_id, folga_variavel: v.folga_variavel, folga_fixa_dow: v.folga_fixa_dow,
      dias: v.dias as unknown as ConfigTrabalho["dias"],
    };
    return detalharCargaSemanal(config, turnos.data ?? []);
  }, [cfg.vigente, turnos.data]);
  const acima = useMemo(() => diasAcimaDe8h(detalhes), [detalhes]);

  const jornada = useMemo<LinhaJornada[]>(() => {
    const ordem = [1, 2, 3, 4, 5, 6, 0];
    const fixa = cfg.vigente?.folga_fixa_dow ?? null;
    return ordem.map((dow) => {
      const d = detalhes.find((x) => x.dow === dow);
      const hm = (v?: string | null) => (v ? String(v).slice(0, 5) : null);
      if (!d || !d.trabalha) return { dia: DOW_LABEL[dow], trabalha: false, minutos: 0, descanso: fixa === dow || (fixa == null && dow === 0) ? "DSR" : "Folga" };
      return { dia: DOW_LABEL[dow], trabalha: true, entrada: hm(d.turno?.entrada), saida: hm(d.turno?.saida), intervalo: d.turno?.intervalo_minutos ?? null, minutos: d.minutos };
    });
  }, [detalhes, cfg.vigente]);
  const [previa, setPrevia] = useState<TermoCompensacaoTipo | null>(null);

  const admite = vinculoAdmiteCompensacao(regime, vinculoLabel);
  const tipos: TermoCompensacaoTipo[] = !admite ? [] : [
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
      const sem = r.semanal as { titulo?: string; assinado: boolean } | null | undefined;
      if (tipos.includes("banco_horas") && !r.banco_horas && sem?.titulo?.includes("Banco de Horas")) r.banco_horas = sem;
      return r;
    },
  });

  if (!tipos.length) return null;

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
              <Button type="button" size="sm" disabled={status.isLoading || extras.isLoading} onClick={() => setPrevia(t)}>
                Revisar e Gerar Termo
              </Button>
            )}
          </div>
        );
      })}
      {previa && (
        <TermoCompensacaoPreviaDialog
          open={!!previa}
          onOpenChange={(v) => { if (!v) setPrevia(null); }}
          tipo={previa}
          bancoDisponivel={!!unidade?.banco_horas}
          companyId={companyId}
          colaboradorId={colaboradorId}
          partes={{
            empresa: extras.data?.empresa ?? "EMPRESA", cnpj: extras.data?.cnpj, unidade: unidade?.nome ? toUpperCadastro(unidade.nome) : null,
            nome: toUpperCadastro(nome), cpf: cpfFmt(cpf), cargo: extras.data?.cargo ? toUpperCadastro(extras.data.cargo) : null,
          }}
          jornada={jornada}
          onEmitido={() => qc.invalidateQueries({ queryKey: ["dp_termos_compensacao", colaboradorId] })}
        />
      )}
    </div>
  );
}
