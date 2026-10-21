// Formas de pagamento disponíveis na conta Asaas de um ambiente.
// Só leitura no Asaas (GET). Resultado em cache por 10 minutos em system_parameters
// (chave billing_formas_cache_<env>), para não consultar o Asaas a cada acesso.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { asaasFetch, type AsaasEnv } from "./asaas.ts";

export type FormaPg = "pix" | "boleto" | "cartao";
export type Disponibilidade = Record<FormaPg, boolean>;
export const MSG_PIX_INDISPONIVEL = "PIX temporariamente indisponível. Escolha boleto ou cartão.";
export const CACHE_MS = 10 * 60 * 1000;

/** Regra pura: PIX só com ao menos uma chave Pix ACTIVE. */
export function pixAtivo(resp: unknown): boolean {
  const lista = (resp as any)?.data;
  return Array.isArray(lista) && lista.some((k: any) => String(k?.status ?? "").toUpperCase() === "ACTIVE");
}

export function cacheValido(c: any, agora = Date.now()): boolean {
  const t = Date.parse(c?.verificado_em ?? "");
  return Number.isFinite(t) && agora - t < CACHE_MS && typeof c?.pix === "boolean";
}

export async function formasDisponiveis(admin: SupabaseClient, env: AsaasEnv, opts: { simularPixIndisponivel?: boolean } = {}): Promise<Disponibilidade> {
  if (opts.simularPixIndisponivel) return { pix: false, boleto: true, cartao: true };
  const chave = `billing_formas_cache_${env}`;
  const { data: c } = await admin.from("system_parameters").select("value").eq("key", chave).maybeSingle();
  if (cacheValido((c as any)?.value)) return { pix: (c as any).value.pix, boleto: true, cartao: true };
  let pix = false;
  try {
    pix = pixAtivo(await asaasFetch("/pix/addressKeys?status=ACTIVE&limit=10", { method: "GET" }, env));
  } catch (e) {
    // falha na consulta: PIX indisponível agora, sem gravar cache (nova tentativa no próximo acesso)
    console.warn("billing-formas: consulta de chaves Pix falhou", (e as Error).message);
    return { pix: false, boleto: true, cartao: true };
  }
  await admin.from("system_parameters").upsert({ key: chave, value: { pix, verificado_em: new Date().toISOString() },
    description: "Cache (10 min) das formas de pagamento disponíveis no Asaas" }, { onConflict: "key" });
  return { pix, boleto: true, cartao: true };
}
