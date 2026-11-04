import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Store } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props { unidadeId: string; data: string; feriadoNome: string }

/** Marca a loja como fechada num feriado: ninguém da unidade é convocado automaticamente nesse dia. */
export function FeriadoLojaFechadaToggle({ unidadeId, data, feriadoNome }: Props) {
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);
  const key = ["dp-feriado-operacao", unidadeId, data];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data: u, error: unidadeError } = await supabase.from("dp_unidades").select("company_id").eq("id", unidadeId).maybeSingle();
      if (unidadeError) throw unidadeError;
      const { data: row, error } = await supabase.from("dp_unidade_feriado_operacao")
        .select("id, fechada").eq("unidade_id", unidadeId).eq("data", data).maybeSingle();
      if (error) throw error;
      return { companyId: u?.company_id as string | undefined, fechada: !!row?.fechada };
    },
  });

  const alternar = async (fechada: boolean) => {
    if (!q.data?.companyId) return;
    setSalvando(true);
    const { error } = fechada
      ? await supabase.from("dp_unidade_feriado_operacao").upsert(
          { company_id: q.data.companyId, unidade_id: unidadeId, data, fechada: true, updated_at: new Date().toISOString() },
          { onConflict: "unidade_id,data" })
      : await supabase.from("dp_unidade_feriado_operacao").delete().eq("unidade_id", unidadeId).eq("data", data);
    setSalvando(false);
    if (error) { toast.error("Não foi possível salvar. Verifique sua permissão para alterar folgas."); return; }
    toast.success(fechada ? "Loja marcada como fechada no feriado." : "Loja aberta no feriado.");
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
    qc.invalidateQueries({ queryKey: ["dp_panorama_feriados"] });
  };

  return (
    <label className="flex min-h-12 items-start gap-3 border-b border-border p-2 text-sm">
      <Store className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Loja fechada neste feriado ({feriadoNome})</span>
        <span className="block text-xs text-muted-foreground">
          {q.data?.fechada
            ? "Ninguém desta unidade será convocado automaticamente nesse dia."
            : "Ligue se a loja não vai abrir: ninguém será convocado automaticamente."}
        </span>
      </span>
      <Switch checked={!!q.data?.fechada} disabled={q.isLoading || q.isError || salvando} onCheckedChange={alternar} aria-label="Loja fechada neste feriado" />
    </label>
  );
}
