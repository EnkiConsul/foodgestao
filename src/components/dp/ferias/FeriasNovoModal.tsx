import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useDpFerias } from "@/hooks/useDpFerias";
import { useDpFeriasConfig } from "@/hooks/useDpFeriasConfig";
import { FeriasGozoDialog } from "@/components/dp/ferias/FeriasGozoDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colaboradorId: string;
  dataInicio?: string | null;
}

/** Agendamento de férias aberto sobre outra tela (ex.: calendário), sem navegar. */
export function FeriasNovoModal({ open, onOpenChange, colaboradorId, dataInicio }: Props) {
  const qc = useQueryClient();
  const { periodos, periodosLoading, gozos, programar } = useDpFerias(colaboradorId || "todos");
  const { config } = useDpFeriasConfig();

  const doColab = useMemo(
    () =>
      periodos
        .filter((p) => p.colaborador_id === colaboradorId && (p.dias_saldo ?? 0) > 0 && p.status !== "concluido")
        .sort((a, b) => String(a.inicio_aquisitivo).localeCompare(String(b.inicio_aquisitivo))),
    [periodos, colaboradorId],
  );

  const fracoesPorPeriodo = useMemo(() => {
    const map: Record<string, { id: string; dias: number }[]> = {};
    for (const g of gozos) {
      if (g.status === "cancelado") continue;
      (map[g.periodo_id] ??= []).push({ id: g.id, dias: g.dias ?? 0 });
    }
    return map;
  }, [gozos]);

  const semSaldo = open && !periodosLoading && doColab.length === 0;
  useEffect(() => {
    if (!semSaldo) return;
    toast.info("Colaborador sem período aquisitivo com saldo disponível", {
      description: "Verifique os períodos abertos na tela de Férias.",
    });
    onOpenChange(false);
  }, [semSaldo, onOpenChange]);

  if (!open || periodosLoading || semSaldo) return null;

  return (
    <FeriasGozoDialog
      open={open}
      onOpenChange={onOpenChange}
      periodos={doColab}
      editing={null}
      defaultPeriodoId={doColab[0]?.id ?? null}
      defaultDataInicio={dataInicio ?? null}
      antecedenciaDias={config.avisoAntecedenciaDias}
      fracionamento={{
        maxFracoes: config.fracionamentoMax,
        minDias: config.fracaoMinDias,
        maiorDias: config.fracaoMaiorDias,
      }}
      fracoesPorPeriodo={fracoesPorPeriodo}
      saving={programar.isPending}
      onSubmit={(input) =>
        programar.mutate(input, {
          onSuccess: () => {
            onOpenChange(false);
            qc.invalidateQueries();
          },
        })
      }
    />
  );
}
