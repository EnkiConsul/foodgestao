import { supabase } from "@/integrations/supabase/client";
import { garantirLimite } from "@/lib/billing/limites";

export interface PedidoExcedente {
  de: number;
  para: number;
  limite: number;
  valorUnitCents: number;
}

type Resolver = (ok: boolean) => void;
type Listener = (p: PedidoExcedente, resolve: Resolver) => void;
let listener: Listener | null = null;

/** Registrado pelo diálogo global montado no App. */
export function registrarConfirmacaoExcedente(fn: Listener | null) {
  listener = fn;
}

function pedirConfirmacao(p: PedidoExcedente): Promise<boolean> {
  if (!listener) return Promise.resolve(false);
  return new Promise((resolve) => listener!(p, resolve));
}

/**
 * Antes de incluir um colaborador novo.
 * Legado: trava rígida. V2: dono/admin confirma o custo do excedente e a
 * ciência é registrada no servidor; sem permissão de gestão segue bloqueado.
 */
export async function garantirColaboradorNovo(companyId: string, nome?: string | null) {
  const { data, error } = await (supabase.rpc as any)("dp_colaborador_excedente_previa", {
    _company_id: companyId,
  });
  if (error || !data || data.modo !== "v2") {
    await garantirLimite(companyId, "pessoas", "colaboradores");
    return;
  }
  const limite = Number(data.limite ?? -1);
  const atual = Number(data.atual ?? 0);
  if (data.isento || limite < 0 || atual + 1 <= limite) return;
  if (!data.pode_gerir) {
    throw new Error(
      "Limite do plano atingido. Só o dono ou um administrador da empresa pode incluir colaboradores acima da franquia.",
    );
  }
  const ok = await pedirConfirmacao({
    de: atual,
    para: atual + 1,
    limite,
    valorUnitCents: Number(data.valor_unit_cents ?? 0),
  });
  if (!ok) throw new Error("Cadastro cancelado: o excedente não foi confirmado.");
  const { error: e2 } = await (supabase.rpc as any)("dp_colaborador_excedente_confirmar", {
    _company_id: companyId,
    _colaborador_nome: nome ?? null,
  });
  if (e2) throw new Error("Não foi possível registrar a confirmação do excedente. Tente novamente.");
}
