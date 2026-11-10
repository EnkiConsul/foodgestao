import { supabase } from "@/integrations/supabase/client";
import { garantirLimite } from "@/lib/billing/limites";
import { avaliarFranquia, comparativoEnterprise, type ComparativoEnterprise, type PreviaFranquia } from "@/lib/billing/franquia";

export interface PedidoExcedente {
  de: number;
  para: number;
  limite: number;
  valorUnitCents: number;
  /** Enterprise mais barato (ou igual) com este colaborador a mais. */
  enterprise?: ComparativoEnterprise | null;
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

/** Prévia da franquia de colaboradores da empresa (null quando não deu para ler). */
export async function buscarPreviaFranquia(companyId: string): Promise<PreviaFranquia | null> {
  const { data, error } = await (supabase.rpc as any)("dp_colaborador_excedente_previa", {
    _company_id: companyId,
  });
  if (error || !data) return null;
  return data as PreviaFranquia;
}

export const MENSAGEM_SEM_PERMISSAO =
  "A franquia de colaboradores do plano está completa. Só o dono ou um administrador da empresa pode incluir colaboradores acima da franquia.";

/**
 * Antes de incluir um colaborador novo.
 * Legado: trava rígida. V2: dono/admin confirma o custo do excedente e a
 * ciência é registrada no servidor; sem permissão de gestão segue bloqueado.
 * Plano por colaborador ativo (Enterprise) não tem franquia: segue direto.
 */
export async function garantirColaboradorNovo(companyId: string, nome?: string | null) {
  const previa = await buscarPreviaFranquia(companyId);
  // Teste grátis em vigor: sem franquia em nenhum modo (o banco também libera).
  if (previa?.em_teste) return;
  if (!previa || previa.modo !== "v2") {
    await garantirLimite(companyId, "pessoas", "colaboradores");
    return;
  }
  const estado = avaliarFranquia(previa, 1);
  if (estado.tipo === "livre" || estado.tipo === "por_colaborador" || estado.tipo === "teste") return;
  if (estado.tipo === "bloqueado") throw new Error(MENSAGEM_SEM_PERMISSAO);
  const ok = await pedirConfirmacao({
    de: estado.atual,
    para: estado.atual + 1,
    limite: estado.limite,
    valorUnitCents: estado.valorUnitCents,
    enterprise: comparativoEnterprise(previa, 1),
  });
  if (!ok) throw new Error("Cadastro cancelado: o excedente não foi confirmado.");
  const { error: e2 } = await (supabase.rpc as any)("dp_colaborador_excedente_confirmar", {
    _company_id: companyId,
    _colaborador_nome: nome ?? null,
  });
  if (e2) throw new Error("Não foi possível registrar a confirmação do excedente. Tente novamente.");
}
