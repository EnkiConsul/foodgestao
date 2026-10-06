// Regras comuns da carência pós-cortesia (revogação e início manual).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendTemplateEmail } from "./transactional-email-templates/send-email.ts";

export const SITE_URL = "https://www.aveto360.com";

export function nomeModulo(m: string | null | undefined): string | undefined {
  if (m === "financeiro") return "Financeiro 360°";
  if (m === "pessoas") return "Pessoas 360°";
  return undefined;
}

/** Último dia da carência às 23:59:59 em America/Sao_Paulo (UTC-3, sem horário de verão). */
export function fimCarencia(dias: number, agora = new Date()): string {
  const hojeBR = new Date(agora.getTime() - 3 * 3600_000); // data civil em Brasília
  const y = hojeBR.getUTCFullYear(), m = hojeBR.getUTCMonth(), d = hojeBR.getUTCDate();
  // 23:59:59 BRT = 02:59:59 UTC do dia seguinte
  return new Date(Date.UTC(y, m, d + dias + 1, 2, 59, 59)).toISOString();
}

export const dataBR = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export async function diasCarencia(admin: SupabaseClient): Promise<number> {
  const { data } = await admin.from("system_parameters")
    .select("value").eq("key", "carencia_pos_cortesia_dias").maybeSingle();
  const n = Number(data?.value);
  return Number.isInteger(n) && n > 0 ? n : 10;
}

/** E-mail ao dono (sem motivo interno). Falha não desfaz a operação. */
export async function avisarDono(
  admin: SupabaseClient,
  sub: { id: string; user_id: string; company_id: string | null; module: string | null },
  graceEndsAt: string,
): Promise<{ emailEnviado: boolean; emailErro: string | null }> {
  try {
    const { data: dono } = await admin.auth.admin.getUserById(sub.user_id);
    const email = dono?.user?.email;
    if (!email) return { emailEnviado: false, emailErro: "dono sem e-mail" };
    const { data: perfil } = await admin.from("profiles").select("full_name")
      .eq("user_id", sub.user_id).maybeSingle();
    const q = admin.from("companies").select("name").order("created_at", { ascending: true }).limit(1);
    const { data: emp } = sub.company_id
      ? await q.eq("id", sub.company_id).maybeSingle()
      : await q.eq("user_id", sub.user_id).maybeSingle();
    const r = await sendTemplateEmail("billing-dunning", email, {
      templateData: {
        stage: "cortesia_encerrada",
        nome: (perfil?.full_name as string | null)?.split(" ")[0] ?? undefined,
        empresa: (emp?.name as string | undefined) ?? undefined,
        modulo: nomeModulo(sub.module),
        data: dataBR(graceEndsAt),
        linkPlanos: `${SITE_URL}/planos`,
        link: `${SITE_URL}/planos`,
      },
      idempotencyKey: `cortesia-encerrada-${sub.id}-${graceEndsAt.slice(0, 10)}`,
    });
    return { emailEnviado: r.sent, emailErro: r.sent ? null : r.reason };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[grace] e-mail:", msg);
    return { emailEnviado: false, emailErro: msg };
  }
}
