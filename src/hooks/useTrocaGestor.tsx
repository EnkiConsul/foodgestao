import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invalidarRotina } from "@/lib/dp/rotina-cache";
import { argsTrocaGestor, participantesComTermo, type TrocaGestorInput, type TrocaGestorPrevia } from "@/lib/dp/troca-gestor";
import { termoTrocaGestorPdf } from "@/lib/dp/termo-troca-gestor";

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
      const previa = await previaTrocaGestor(input);
      if (!previa.participantes) throw new Error("Não foi possível conferir quem assinará os termos. Tente novamente.");
      const requisicao = crypto.randomUUID();
      const arquivos: { colaborador_id: string; file_path: string; file_size: number }[] = [];
      for (const p of participantesComTermo(previa.participantes)) {
        // Only the participant's civil name and dates; internal reasons may mention the colleague.
        const bytes = await termoTrocaGestorPdf({ empresa: p.empresa, nome: p.nome, dataFixa: p.data_original, dataNova: p.data_nova, origem: "empresa", folgaFixa: false, trocaEntrePessoas: true }, false);
        const file_path = `${input.companyId}/${p.colaborador_id}/trocas/${requisicao}/termo-alteracao-folga-${p.data_original}.pdf`;
        const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
        const { error } = await supabase.storage.from("dp-documentos").upload(file_path, blob, { contentType: "application/pdf", upsert: false });
        if (error) throw new Error("Não foi possível guardar os termos. A troca não foi registrada. Tente novamente.");
        arquivos.push({ colaborador_id: p.colaborador_id, file_path, file_size: blob.size });
      }
      const { data, error } = await rpc("dp_troca_gestor_registrar_documentada", {
        ...argsTrocaGestor(input), _motivo: input.motivo.trim(), _ciente_dsr: input.cienteDsr, _requisicao: requisicao, _arquivos: arquivos,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async () => {
      await Promise.all([invalidarRotina(qc), ...["dp_trocas", "dp_meu_trocas", "dp_dsr_ciencias_trocas", "dp_horario_previsto", "dp_documentos", "dp_meus_documentos"].map(key => qc.invalidateQueries({ queryKey: [key] }))]);
    },
  });
}