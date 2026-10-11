import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MultiSelectFilter } from "@/components/lancamentos/MultiSelectFilter";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import type { AlvoRegra } from "@/lib/dp/bloqueios";

const ROTULO: Record<Exclude<AlvoRegra, "todos">, [string, string, string]> = {
  cargo: ["Selecione os cargos", "cargo selecionado", "cargos selecionados"],
  setor: ["Selecione os setores", "setor selecionado", "setores selecionados"],
  colaborador: ["Selecione os colaboradores", "colaborador selecionado", "colaboradores selecionados"],
};

type Props = {
  companyId: string | null | undefined;
  tipo: AlvoRegra;
  value: string[];
  onChange: (ids: string[]) => void;
  erro?: boolean;
};

/** Seleção múltipla de cargos, setores ou colaboradores para bloqueios. */
export function AlvoMultiSelect({ companyId, tipo, value, onChange, erro }: Props) {
  const q = useQuery({
    queryKey: ["dp_bloqueio_alvo_opcoes", companyId, tipo],
    enabled: !!companyId && tipo !== "todos",
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const tabela = tipo === "cargo" ? "dp_cargos" : tipo === "setor" ? "dp_setores" : "dp_colaboradores";
      let qb = supabase.from(tabela as "dp_cargos").select("id, nome").eq("company_id", companyId!).eq("ativo", true);
      if (tipo === "cargo") qb = qb.is("removido_em", null);
      if (tipo === "colaborador") qb = (qb as any).is("deleted_at", null);
      const { data, error } = await qb.order("nome");
      if (error) throw error;
      return (data ?? []).map((r: { id: string; nome: string }) => ({ id: r.id, name: r.nome }));
    },
  });
  if (tipo === "todos") return null;
  const [todos, sing, plur] = ROTULO[tipo];
  const opcoes = q.data ?? [];
  return (
    <div className="space-y-2">
      <MultiSelectFilter
        value={value}
        onChange={onChange}
        options={opcoes}
        allLabel={q.isLoading ? "Carregando..." : todos}
        itemLabelSingular={sing}
        itemLabelPlural={plur}
        triggerClassName={`mt-0 h-10 text-sm ${erro ? "border-destructive" : ""}`}
      />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1 pr-1">
              {opcoes.find((o) => o.id === id)?.name ?? "..."}
              <button type="button" aria-label="Remover" onClick={() => onChange(value.filter((v) => v !== id))}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
