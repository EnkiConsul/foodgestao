import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";

export type DpUnidade = Database["public"]["Tables"]["dp_unidades"]["Row"];
export type DpUnidadeInsert = Database["public"]["Tables"]["dp_unidades"]["Insert"];
export type DpCargo = Database["public"]["Tables"]["dp_cargos"]["Row"];
export type DpCargoInsert = Database["public"]["Tables"]["dp_cargos"]["Insert"];
export type DpSindicato = Database["public"]["Tables"]["dp_sindicatos"]["Row"];
export type DpSindicatoInsert = Database["public"]["Tables"]["dp_sindicatos"]["Insert"];

// ---------------- Unidades ----------------
export type DpUnidadeWithCounts = DpUnidade & {
  cargos_count: number;
  sindicatos_patronais_count: number;
};

export function useDpUnidades() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_unidades", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<DpUnidadeWithCounts[]> => {
      const { data, error } = await supabase
        .from("dp_unidades")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (error) throw error;
      const unidades = (data ?? []) as DpUnidade[];
      const ids = unidades.map((u) => u.id);
      if (ids.length === 0) {
        return unidades.map((u) => ({ ...u, cargos_count: 0, sindicatos_patronais_count: 0 }));
      }

      const [{ data: uc, error: ucErr }, { data: su, error: suErr }] = await Promise.all([
        supabase.from("dp_unidade_cargos").select("unidade_id").in("unidade_id", ids),
        supabase
          .from("dp_sindicato_unidades")
          .select("unidade_id, dp_sindicatos!inner(tipo)")
          .in("unidade_id", ids)
          .eq("dp_sindicatos.tipo", "patronal"),
      ]);
      if (ucErr) throw ucErr;
      if (suErr) throw suErr;

      const cargosMap = new Map<string, number>();
      (uc ?? []).forEach((r: any) => cargosMap.set(r.unidade_id, (cargosMap.get(r.unidade_id) ?? 0) + 1));
      const sindMap = new Map<string, number>();
      (su ?? []).forEach((r: any) => sindMap.set(r.unidade_id, (sindMap.get(r.unidade_id) ?? 0) + 1));

      return unidades.map((u) => ({
        ...u,
        cargos_count: cargosMap.get(u.id) ?? 0,
        sindicatos_patronais_count: sindMap.get(u.id) ?? 0,
      }));
    },
  });
}

export function useToggleDpUnidadeAtivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("dp_unidades").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_unidades"] }),
  });
}

export function useUpsertDpUnidade() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (input: Partial<DpUnidadeInsert> & { id?: string; nome: string }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const payload = { ...input, company_id: selectedCompanyId } as DpUnidadeInsert;
      if (input.id) {
        const { error } = await supabase.from("dp_unidades").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dp_unidades").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_unidades"] }),
  });
}

export function useDeleteDpUnidade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_unidades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_unidades"] }),
  });
}

// ---------------- Cargos ----------------
export function useDpCargos() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_cargos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_cargos")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as DpCargo[];
    },
  });
}

export function useUpsertDpCargo() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (input: Partial<DpCargoInsert> & { id?: string; nome: string }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const payload = { ...input, company_id: selectedCompanyId } as DpCargoInsert;
      if (input.id) {
        const { error } = await supabase.from("dp_cargos").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dp_cargos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_cargos"] }),
  });
}

export function useDeleteDpCargo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_cargos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_cargos"] }),
  });
}

// ---------------- Sindicatos ----------------
export function useDpSindicatos() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_sindicatos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_sindicatos")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as DpSindicato[];
    },
  });
}

export function useUpsertDpSindicato() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (input: Partial<DpSindicatoInsert> & { id?: string; nome: string }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const payload = { ...input, company_id: selectedCompanyId } as DpSindicatoInsert;
      if (input.id) {
        const { error } = await supabase.from("dp_sindicatos").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dp_sindicatos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_sindicatos"] }),
  });
}

export function useDeleteDpSindicato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_sindicatos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_sindicatos"] }),
  });
}
