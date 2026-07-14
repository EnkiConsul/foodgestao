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
export function useDpUnidades() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_unidades", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_unidades")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as DpUnidade[];
    },
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
