import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";
import { diaAnterior } from "@/lib/dp/cargoSalarios";

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
  company_name?: string | null;
};

export function useDpUnidades() {
  const { companies } = useCompanyContext();
  const companyIds = companies.map((c) => c.id);
  const key = companyIds.join(",");
  return useQuery({
    queryKey: ["dp_unidades", key],
    enabled: companyIds.length > 0,
    queryFn: async (): Promise<DpUnidadeWithCounts[]> => {
      const { data, error } = await supabase
        .from("dp_unidades")
        .select("*, companies(id, name, trade_name)")
        .in("company_id", companyIds)
        .order("nome");
      if (error) throw error;
      const unidades = (data ?? []) as any[];
      const ids = unidades.map((u) => u.id);
      if (ids.length === 0) {
        return [];
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
        ...(u as DpUnidade),
        cargos_count: cargosMap.get(u.id) ?? 0,
        sindicatos_patronais_count: sindMap.get(u.id) ?? 0,
        company_name: u.companies?.trade_name || u.companies?.name || null,
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
  return useMutation({
    mutationFn: async (input: Partial<DpUnidadeInsert> & { id?: string; nome: string; company_id: string }) => {
      if (!input.company_id) throw new Error("Empresa é obrigatória");
      const payload = { ...input } as DpUnidadeInsert;
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
export type DpCargoWithCount = DpCargo & { colaboradores_count: number };

export function useDpCargos() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_cargos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<DpCargoWithCount[]> => {
      const { data, error } = await supabase
        .from("dp_cargos")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (error) throw error;
      const cargos = (data ?? []) as DpCargo[];
      if (cargos.length === 0) return [];
      const { data: cols, error: colErr } = await supabase
        .from("dp_colaboradores")
        .select("cargo_id")
        .eq("company_id", selectedCompanyId!)
        .not("cargo_id", "is", null);
      if (colErr) throw colErr;
      const map = new Map<string, number>();
      (cols ?? []).forEach((c: any) => {
        if (c.cargo_id) map.set(c.cargo_id, (map.get(c.cargo_id) ?? 0) + 1);
      });
      return cargos.map((c) => ({ ...c, colaboradores_count: map.get(c.id) ?? 0 }));
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
        const { data, error } = await supabase
          .from("dp_cargos")
          .update(payload)
          .eq("id", input.id)
          .select("*")
          .single();
        if (error) throw error;
        return data as DpCargo;
      }
      const { data, error } = await supabase
        .from("dp_cargos")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      return data as DpCargo;
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
export type DpSindicatoWithCounts = DpSindicato & {
  unidades_count: number;
  cargos_count: number;
};

export function useDpSindicatos() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_sindicatos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<DpSindicatoWithCounts[]> => {
      const { data, error } = await supabase
        .from("dp_sindicatos")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (error) throw error;
      const sinds = (data ?? []) as DpSindicato[];
      if (sinds.length === 0) return [];
      const ids = sinds.map((s) => s.id);
      const [{ data: uni }, { data: cgs }] = await Promise.all([
        supabase.from("dp_sindicato_unidades").select("sindicato_id").in("sindicato_id", ids),
        supabase.from("dp_sindicato_cargos").select("sindicato_id").in("sindicato_id", ids),
      ]);
      const uniMap = new Map<string, number>();
      (uni ?? []).forEach((r: any) => uniMap.set(r.sindicato_id, (uniMap.get(r.sindicato_id) ?? 0) + 1));
      const cgMap = new Map<string, number>();
      (cgs ?? []).forEach((r: any) => cgMap.set(r.sindicato_id, (cgMap.get(r.sindicato_id) ?? 0) + 1));
      return sinds.map((s) => ({
        ...s,
        unidades_count: uniMap.get(s.id) ?? 0,
        cargos_count: cgMap.get(s.id) ?? 0,
      }));
    },
  });
}

export function useUpsertDpSindicato() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (input: Partial<DpSindicatoInsert> & { id?: string; nome: string }): Promise<string> => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const payload = { ...input, company_id: selectedCompanyId } as DpSindicatoInsert;
      if (input.id) {
        const { error } = await supabase.from("dp_sindicatos").update(payload).eq("id", input.id);
        if (error) throw error;
        return input.id;
      } else {
        const { data, error } = await supabase.from("dp_sindicatos").insert(payload).select("id").single();
        if (error) throw error;
        return data.id;
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

// ---------------- Piso do cargo por sindicato patronal ----------------
// O piso é negociado pelo sindicato patronal (que é da unidade): unidades com
// o mesmo patronal compartilham o piso; ajustes por unidade são opcionais e
// precisam ficar acima do piso.
export type DpCargoSalario = Database["public"]["Tables"]["dp_cargo_salarios"]["Row"];
export type DpCargoSalarioInsert = Database["public"]["Tables"]["dp_cargo_salarios"]["Insert"];

/** Sindicato patronal vinculado a cada unidade da empresa. */
export function useDpPatronalPorUnidade() {
  const { companies } = useCompanyContext();
  const companyIds = companies.map((c) => c.id);
  return useQuery({
    queryKey: ["dp_patronal_por_unidade", companyIds.join(",")],
    enabled: companyIds.length > 0,
    queryFn: async (): Promise<Record<string, { id: string; nome: string }>> => {
      const { data, error } = await supabase
        .from("dp_sindicato_unidades")
        .select("unidade_id, sindicato_id, dp_sindicatos!inner(id, nome, tipo)")
        .eq("dp_sindicatos.tipo", "patronal");
      if (error) throw error;
      const map: Record<string, { id: string; nome: string }> = {};
      for (const row of (data ?? []) as any[]) {
        if (!map[row.unidade_id]) map[row.unidade_id] = { id: row.sindicato_id, nome: row.dp_sindicatos?.nome ?? "" };
      }
      return map;
    },
  });
}

export function useDpCargoSalarios(cargoId?: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_cargo_salarios", selectedCompanyId, cargoId ?? "all"],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<DpCargoSalario[]> => {
      let q = supabase
        .from("dp_cargo_salarios")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("vigencia_inicio", { ascending: false });
      if (cargoId) q = q.eq("cargo_id", cargoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DpCargoSalario[];
    },
  });
}

export function useUpsertDpCargoSalario() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (
      input: Partial<DpCargoSalarioInsert> & { cargo_id: string; salario_base: number },
    ) => {

      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const payload = { ...input, company_id: selectedCompanyId } as DpCargoSalarioInsert;
      if (input.id) {
        const { data, error } = await supabase
          .from("dp_cargo_salarios")
          .update(payload)
          .eq("id", input.id)
          .select("*")
          .single();
        if (error) throw error;
        return data as DpCargoSalario;
      }

      // Só existe um valor em aberto por escopo (cargo + patronal, ou cargo +
      // unidade): o novo piso sucede o anterior, encerrando sua vigência.
      const inicio = (payload.vigencia_inicio as string) || new Date().toISOString().slice(0, 10);
      if (!payload.vigencia_fim) {
        let q = supabase
          .from("dp_cargo_salarios")
          .select("id, vigencia_inicio")
          .eq("company_id", selectedCompanyId)
          .eq("cargo_id", payload.cargo_id)
          .is("vigencia_fim", null);
        q = payload.unidade_id
          ? q.eq("unidade_id", payload.unidade_id)
          : q.is("unidade_id", null).eq("sindicato_patronal_id", payload.sindicato_patronal_id!);
        const { data: abertos, error: abertosErr } = await q;
        if (abertosErr) throw abertosErr;
        for (const linha of abertos ?? []) {
          if (linha.vigencia_inicio >= inicio) {
            // Mesma vigência (ou posterior): atualiza a linha existente.
            const { data, error } = await supabase
              .from("dp_cargo_salarios")
              .update({ ...payload, vigencia_inicio: inicio })
              .eq("id", linha.id)
              .select("*")
              .single();
            if (error) throw error;
            return data as DpCargoSalario;
          }
          const { error } = await supabase
            .from("dp_cargo_salarios")
            .update({ vigencia_fim: diaAnterior(inicio) })
            .eq("id", linha.id);
          if (error) throw error;
        }
      }

      const { data, error } = await supabase
        .from("dp_cargo_salarios")
        .insert({ ...payload, vigencia_inicio: inicio })
        .select("*")
        .single();
      if (error) throw error;
      return data as DpCargoSalario;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_cargo_salarios"] }),
  });
}

export function useDeleteDpCargoSalario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_cargo_salarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_cargo_salarios"] }),
  });
}
