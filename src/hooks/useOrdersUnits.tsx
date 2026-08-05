import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type {
  FulfillmentMode,
  HourException,
  HourPeriod,
  OrderChannel,
  PaymentKind,
  UnitChecklist,
  UnitState,
} from "@/lib/orders/units";

export interface OrdersUnit {
  id: string;
  company_id: string;
  unidade_id: string;
  codigo_interno: string | null;
  timezone: string;
  operational_state: UnitState;
  fulfillment_modes: FulfillmentMode[];
  channels: OrderChannel[];
  accept_mode: "manual" | "automatic";
  prep_time_minutes: number;
  scheduled_orders_enabled: boolean;
  sound_enabled: boolean;
  notifications_enabled: boolean;
  printer_enabled: boolean;
  responsible_user_id: string | null;
  external_menu_url: string | null;
  onboarding_step: number;
  onboarding_completed_at: string | null;
  test_order_completed_at: string | null;
  activated_at: string | null;
  nome: string;
  telefone: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
}

const UNITS_KEY = "orders-units";

/** Unidades operacionais da empresa selecionada (com dados de cadastro). */
export function useOrdersUnits() {
  const { contextType, selectedCompanyId } = useCompanyContext();
  const enabled = contextType === "pj" && !!selectedCompanyId;

  return useQuery({
    queryKey: [UNITS_KEY, selectedCompanyId],
    enabled,
    queryFn: async (): Promise<OrdersUnit[]> => {
      const { data, error } = await supabase
        .from("ped_units")
        .select("*, dp_unidades!inner(nome, telefone, endereco, cidade, uf)")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => {
        const { dp_unidades, ...unit } = row as typeof row & {
          dp_unidades: { nome: string; telefone: string | null; endereco: string | null; cidade: string | null; uf: string | null };
        };
        return { ...unit, ...dp_unidades } as OrdersUnit;
      });
    },
  });
}

export function useOrdersUnitHours(unitId: string | null) {
  return useQuery({
    queryKey: [UNITS_KEY, "hours", unitId],
    enabled: !!unitId,
    queryFn: async () => {
      const [hours, exceptions, payments] = await Promise.all([
        supabase.from("ped_unit_hours").select("weekday, opens_at, closes_at").eq("unit_id", unitId!),
        supabase
          .from("ped_unit_hour_exceptions")
          .select("exception_date, is_closed, opens_at, closes_at, note")
          .eq("unit_id", unitId!),
        supabase.from("ped_unit_payment_options").select("kind, is_active").eq("unit_id", unitId!),
      ]);
      if (hours.error) throw hours.error;
      if (exceptions.error) throw exceptions.error;
      if (payments.error) throw payments.error;
      return {
        hours: (hours.data ?? []).map((h) => ({
          weekday: h.weekday,
          opens_at: String(h.opens_at).slice(0, 5),
          closes_at: String(h.closes_at).slice(0, 5),
        })) as HourPeriod[],
        exceptions: (exceptions.data ?? []).map((e) => ({
          exception_date: e.exception_date,
          is_closed: e.is_closed,
          opens_at: e.opens_at ? String(e.opens_at).slice(0, 5) : null,
          closes_at: e.closes_at ? String(e.closes_at).slice(0, 5) : null,
          note: e.note,
        })) as HourException[],
        paymentKinds: (payments.data ?? []).filter((p) => p.is_active).map((p) => p.kind as PaymentKind),
      };
    },
  });
}

export function useOrdersUnitChecklist(unitId: string | null) {
  return useQuery({
    queryKey: [UNITS_KEY, "checklist", unitId],
    enabled: !!unitId,
    queryFn: async (): Promise<UnitChecklist> => {
      const { data, error } = await supabase.rpc("ped_unit_checklist", { p_unit_id: unitId! });
      if (error) throw error;
      return data as unknown as UnitChecklist;
    },
  });
}

function useInvalidateUnits() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [UNITS_KEY] });
  };
}

export interface UnitIdentityInput {
  unitId?: string | null;
  nome: string;
  codigo_interno?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  timezone: string;
  responsible_user_id?: string | null;
}

export function useSaveOrdersUnitIdentity() {
  const { selectedCompanyId } = useCompanyContext();
  const invalidate = useInvalidateUnits();

  return useMutation({
    mutationFn: async (input: UnitIdentityInput) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const { data, error } = await supabase.rpc("ped_upsert_unit", {
        p_company_id: selectedCompanyId,
        p_nome: input.nome,
        p_unit_id: input.unitId ?? undefined,
        p_codigo_interno: input.codigo_interno ?? undefined,
        p_telefone: input.telefone ?? undefined,
        p_endereco: input.endereco ?? undefined,
        p_cidade: input.cidade ?? undefined,
        p_uf: input.uf ?? undefined,
        p_timezone: input.timezone,
        p_responsible_user_id: input.responsible_user_id ?? undefined,
      });
      if (error) throw error;
      return data as unknown as { success: boolean; unit_id: string; onboarding_step: number };
    },
    onSuccess: () => {
      invalidate();
      toast.success("Dados da operação salvos.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export interface UnitServiceInput {
  unitId: string;
  fulfillment_modes: FulfillmentMode[];
  channels: OrderChannel[];
  prep_time_minutes: number;
  scheduled_orders_enabled: boolean;
  hours: HourPeriod[];
  exceptions: HourException[];
}

export function useSaveOrdersUnitService() {
  const invalidate = useInvalidateUnits();
  return useMutation({
    mutationFn: async (input: UnitServiceInput) => {
      const { data, error } = await supabase.rpc("ped_save_unit_service", {
        p_unit_id: input.unitId,
        p_fulfillment_modes: input.fulfillment_modes,
        p_channels: input.channels,
        p_prep_time_minutes: input.prep_time_minutes,
        p_scheduled_orders_enabled: input.scheduled_orders_enabled,
        p_hours: input.hours as unknown as never,
        p_exceptions: input.exceptions as unknown as never,
      });
      if (error) throw error;
      return data as unknown as { success: boolean; hours_saved: number };
    },
    onSuccess: () => {
      invalidate();
      toast.success("Atendimento e horários salvos.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export interface UnitReceivingInput {
  unitId: string;
  payment_kinds: PaymentKind[];
  accept_mode: "manual" | "automatic";
  sound_enabled: boolean;
  notifications_enabled: boolean;
  printer_enabled: boolean;
  external_menu_url?: string | null;
}

export function useSaveOrdersUnitReceiving() {
  const invalidate = useInvalidateUnits();
  return useMutation({
    mutationFn: async (input: UnitReceivingInput) => {
      const { data, error } = await supabase.rpc("ped_save_unit_receiving", {
        p_unit_id: input.unitId,
        p_payment_kinds: input.payment_kinds,
        p_accept_mode: input.accept_mode,
        p_sound_enabled: input.sound_enabled,
        p_notifications_enabled: input.notifications_enabled,
        p_printer_enabled: input.printer_enabled,
        p_external_menu_url: input.external_menu_url ?? undefined,
      });
      if (error) throw error;
      return data as unknown as { success: boolean };
    },
    onSuccess: () => {
      invalidate();
      toast.success("Configuração de recebimento salva.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateTestOrder() {
  const invalidate = useInvalidateUnits();
  return useMutation({
    mutationFn: async (unitId: string) => {
      const { data, error } = await supabase.rpc("ped_create_test_order", { p_unit_id: unitId });
      if (error) throw error;
      return data as unknown as { success: boolean; test_order_id: string };
    },
    onSuccess: () => {
      invalidate();
      toast.success("Pedido de teste concluído — nenhum dado real foi afetado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useActivateOrdersUnit() {
  const invalidate = useInvalidateUnits();
  return useMutation({
    mutationFn: async (unitId: string) => {
      const { data, error } = await supabase.rpc("activate_orders_unit", { p_unit_id: unitId });
      if (error) throw error;
      return data as unknown as {
        success: boolean;
        code: string;
        message: string;
        missing?: string[];
      };
    },
    onSuccess: (result) => {
      invalidate();
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSetOrdersUnitState() {
  const invalidate = useInvalidateUnits();
  return useMutation({
    mutationFn: async ({ unitId, state }: { unitId: string; state: UnitState }) => {
      const { data, error } = await supabase.rpc("ped_set_unit_state", {
        p_unit_id: unitId,
        p_state: state,
      });
      if (error) throw error;
      return data as unknown as { success: boolean; operational_state: UnitState };
    },
    onSuccess: () => {
      invalidate();
      toast.success("Estado da unidade atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
