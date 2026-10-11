import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MultiSelectFilter } from "@/components/lancamentos/MultiSelectFilter";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import type { AlvoRegra } from "@/lib/dp/bloqueios";
import { colaboradorElegivelBloqueio } from "@/lib/dp/bloqueio-elegibilidade";

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
  /** Restringe às unidades informadas (vazio = todas). */
  unidadeIds?: string[] | null;
  /** Bloqueio de um dia: quem já tem folga marcada nessa data não aparece. */
  data?: string | null;
};

/**
 * Seleção múltipla de cargos, setores ou colaboradores para bloqueios.
 * Só lista quem participa da escolha de folga (sem sócio, intermitente,
 * freelancer não mensalista ou folga fixa no domingo); cargos e setores
 * só aparecem se tiverem ao menos um colaborador elegível.
 */
export function AlvoMultiSelect({ companyId, tipo, value, onChange, erro, unidadeIds, data }: Props) {
  const unidKey = (unidadeIds ?? []).slice().sort().join(",");
  const q = useQuery({
    queryKey: ["dp_bloqueio_alvo_opcoes", companyId, tipo, unidKey, data ?? null],
    enabled: !!companyId && tipo !== "todos",
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      let cq = supabase
        .from("dp_colaboradores")
        .select("id, nome, cargo_id, setor_id, unidade_id, regime, forma_pagamento, vinculo_label, folga_fixa_semana")
        .eq("company_id", companyId!)
        .eq("ativo", true)
        .is("deleted_at", null);
      if (unidadeIds?.length) cq = cq.in("unidade_id", unidadeIds);
      const { data: colabs, error } = await cq.order("nome");
      if (error) throw error;
      let elegiveis = (colabs ?? []).filter((c: any) => colaboradorElegivelBloqueio(c));
      if (data) {
        const ids = elegiveis.map((c: any) => c.id);
        if (ids.length) {
          const { data: fs, error: fe } = await supabase
            .from("dp_folgas").select("colaborador_id").eq("data", data).neq("status", "cancelada").in("colaborador_id", ids);
          if (fe) throw fe;
          const comFolga = new Set((fs ?? []).map((f: any) => f.colaborador_id));
          elegiveis = elegiveis.filter((c: any) => !comFolga.has(c.id) || value.includes(c.id));
        }
      }
      if (tipo === "colaborador") return elegiveis.map((c: any) => ({ id: c.id, name: c.nome }));
      const campo = tipo === "cargo" ? "cargo_id" : "setor_id";
      const usados = new Set(elegiveis.map((c: any) => c[campo]).filter(Boolean));
      const tabela = tipo === "cargo" ? "dp_cargos" : "dp_setores";
      let qb = supabase.from(tabela as "dp_cargos").select("id, nome").eq("company_id", companyId!).eq("ativo", true);
      if (tipo === "cargo") qb = qb.is("removido_em", null);
      const { data: rows, error: e2 } = await qb.order("nome");
      if (e2) throw e2;
      return (rows ?? [])
        .filter((r: { id: string }) => usados.has(r.id) || value.includes(r.id))
        .map((r: { id: string; nome: string }) => ({ id: r.id, name: r.nome }));
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
      {!q.isLoading && opcoes.length === 0 && (
        <p className="text-xs text-muted-foreground">Ninguém disponível: só aparece quem participa da escolha de folga{data ? " e ainda não marcou folga neste dia" : ""}.</p>
      )}
      {value.length > 0 && (
        <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto overscroll-contain">
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
