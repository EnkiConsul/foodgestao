import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Lock, Store } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props { unidadeId: string; data: string; feriadoNome?: string | null }

const chave = (unidadeId: string, data: string) => ["dp-feriado-operacao", unidadeId, data];

function useOperacaoDia(unidadeId: string, data: string) {
  return useQuery({
    queryKey: chave(unidadeId, data),
    queryFn: async () => {
      const { data: u, error: unidadeError } = await supabase.from("dp_unidades").select("company_id").eq("id", unidadeId).maybeSingle();
      if (unidadeError) throw unidadeError;
      const { data: row, error } = await supabase.from("dp_unidade_feriado_operacao")
        .select("id, fechada").eq("unidade_id", unidadeId).eq("data", data).maybeSingle();
      if (error) throw error;
      return { companyId: u?.company_id as string | undefined, fechada: !!row?.fechada };
    },
  });
}

/** Selo exibido no topo do dia quando a unidade não abre nessa data. */
export function LojaSemExpedienteSelo({ unidadeId, data, feriadoNome }: Props) {
  const q = useOperacaoDia(unidadeId, data);
  if (!q.data?.fechada) return null;
  return (
    <Badge variant="outline" className="shrink-0 gap-1 border-calendar-feriado/40 bg-background text-[11px]">
      <Lock className="h-3 w-3" />{feriadoNome ? "Loja fechada no feriado" : "Sem expediente"}
    </Badge>
  );
}

/** Marca a loja como fechada (feriado ou dia comum): ninguém é escalado nem pode pedir folga. */
export function FeriadoLojaFechadaToggle({ unidadeId, data, feriadoNome }: Props) {
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);
  const [folgasExistentes, setFolgasExistentes] = useState<string[] | null>(null);
  const q = useOperacaoDia(unidadeId, data);

  const gravar = async (fechada: boolean) => {
    if (!q.data?.companyId) return;
    setSalvando(true);
    const { error } = fechada
      ? await supabase.from("dp_unidade_feriado_operacao").upsert(
          { company_id: q.data.companyId, unidade_id: unidadeId, data, fechada: true, updated_at: new Date().toISOString() },
          { onConflict: "unidade_id,data" })
      : await supabase.from("dp_unidade_feriado_operacao").delete().eq("unidade_id", unidadeId).eq("data", data);
    setSalvando(false);
    setFolgasExistentes(null);
    if (error) { toast.error("Não foi possível salvar. Verifique sua permissão para alterar folgas."); return; }
    toast.success(fechada ? (feriadoNome ? "Loja marcada como fechada no feriado." : "Loja marcada sem expediente nesta data.") : "Loja volta a operar nesta data.");
    qc.invalidateQueries({ queryKey: chave(unidadeId, data) });
    qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
    qc.invalidateQueries({ queryKey: ["dp_panorama_feriados"] });
  };

  const alternar = async (fechada: boolean) => {
    if (!fechada) return gravar(false);
    setSalvando(true);
    const { data: folgas } = await supabase.from("dp_folgas")
      .select("colaborador_id, dp_colaboradores!inner(nome, unidade_id)")
      .eq("data", data).neq("status", "cancelada").eq("dp_colaboradores.unidade_id", unidadeId);
    setSalvando(false);
    const nomes = ((folgas ?? []) as Array<{ dp_colaboradores: { nome: string } | null }>)
      .map((f) => f.dp_colaboradores?.nome).filter(Boolean) as string[];
    if (nomes.length) { setFolgasExistentes(nomes); return; }
    gravar(true);
  };

  return (
    <div className="border-b border-border">
      <label className="flex min-h-12 items-start gap-3 p-2 text-sm">
        <Store className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{feriadoNome ? `Loja fechada neste feriado (${feriadoNome})` : "Loja sem expediente nesta data"}</span>
          <span className="block text-xs text-muted-foreground">
            {q.data?.fechada
              ? "Ninguém será escalado nem poderá pedir folga: o dia é descanso remunerado e não usa a cota."
              : feriadoNome ? "Ligue se a loja não vai abrir: ninguém será convocado automaticamente." : "Use para reforma, manutenção ou recesso: ninguém será escalado nem poderá pedir folga."}
          </span>
        </span>
        <Switch checked={!!q.data?.fechada} disabled={q.isLoading || q.isError || salvando || !!folgasExistentes} onCheckedChange={alternar} aria-label={feriadoNome ? "Loja fechada neste feriado" : "Loja sem expediente nesta data"} />
      </label>
      {folgasExistentes && (
        <div role="alert" className="mx-2 mb-2 space-y-2 rounded-lg bg-muted p-2 text-xs">
          <p><strong>{folgasExistentes.length} {folgasExistentes.length === 1 ? "pessoa já tem" : "pessoas já têm"} folga marcada neste dia:</strong> {folgasExistentes.join(", ")}.</p>
          <p className="text-muted-foreground">A folga continuará valendo. Se quiser devolvê-la, realoque a folga para outra data depois de fechar a loja.</p>
          <div className="flex gap-2">
            <Button size="sm" className="h-11 flex-1" disabled={salvando} onClick={() => gravar(true)}>Fechar mesmo assim</Button>
            <Button size="sm" variant="outline" className="h-11 flex-1" onClick={() => setFolgasExistentes(null)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
