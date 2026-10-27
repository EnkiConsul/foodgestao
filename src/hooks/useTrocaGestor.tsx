import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invalidarRotina } from "@/lib/dp/rotina-cache";
import { argsTrocaGestor, type TrocaGestorInput, type TrocaGestorPrevia } from "@/lib/dp/troca-gestor";

const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function previaTrocaGestor(input: Parameters<typeof argsTrocaGestor>[0]): Promise<TrocaGestorPrevia> {
  const { data, error } = await rpc("dp_troca_gestor_previa", argsTrocaGestor(input));
  if (error) throw new Error(error.message);
  return data as TrocaGestorPrevia;
}

export function useRegistrarTrocaGestor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TrocaGestorInput) => {
      const { data, error } = await rpc("dp_troca_gestor_registrar", {
        ...argsTrocaGestor(input), _motivo: input.motivo.trim(), _ciente_dsr: input.cienteDsr, _notificar: input.notificar,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async () => {
      await Promise.all([invalidarRotina(qc), ...["dp_trocas", "dp_meu_trocas", "dp_dsr_ciencias_trocas", "dp_horario_previsto"].map(key => qc.invalidateQueries({ queryKey: [key] }))]);
    },
  });
}