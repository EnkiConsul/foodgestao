import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useDpUnidades } from "@/hooks/useDpCadastros";

export interface VincularUnidadeLoteProps {
  batchId: string;
  companyId?: string | null;
  onLinked?: (unidadeId: string) => void;
}

/** Permite ao gestor vincular manualmente uma unidade ao lote de importação. */
export function VincularUnidadeLote({ batchId, companyId, onLinked }: VincularUnidadeLoteProps) {
  const qc = useQueryClient();
  const { data: unidades = [] } = useDpUnidades();
  const [value, setValue] = useState<string>("");

  const opcoes = unidades.filter(
    (u) => u.ativo !== false && (!companyId || u.company_id === companyId),
  );

  const vincular = useMutation({
    mutationFn: async (unidadeId: string) => {
      const { error } = await supabase
        .from("dp_bulk_import_batches" as any)
        .update({ unidade_id: unidadeId } as any)
        .eq("id", batchId);
      if (error) throw error;
      return unidadeId;
    },
    onSuccess: (unidadeId) => {
      qc.invalidateQueries({ queryKey: ["dp_bulk_batch_info", batchId] });
      qc.invalidateQueries({ queryKey: ["dp_bulk_batches"] });
      toast.success("Unidade Vinculada Ao Lote");
      onLinked?.(unidadeId);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao vincular unidade"),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="h-8 w-[220px] bg-background text-xs">
          <SelectValue placeholder="Selecionar unidade…" />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((u) => (
            <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-8 text-xs"
        disabled={!value || vincular.isPending}
        onClick={() => value && vincular.mutate(value)}
      >
        {vincular.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
        Vincular
      </Button>
      <Button asChild size="sm" variant="outline" className="h-8 text-xs">
        <Link to="/dp/cadastros/unidades">
          <Plus className="h-3.5 w-3.5 mr-1" /> Cadastrar Nova Unidade
        </Link>
      </Button>
    </div>
  );
}
