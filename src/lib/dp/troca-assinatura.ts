import { supabase } from "@/integrations/supabase/client";

const FRASES: Record<string, string> = {
  assinatura_invalida: "Desenhe ou escolha a sua assinatura antes de confirmar.",
  sem_acesso_portal: "Seu acesso não permite assinar a troca agora. Fale com o gestor.",
  troca_nao_encontrada: "Não encontramos esta troca. Atualize a tela e tente de novo.",
  troca_nao_pendente: "Esta troca já foi respondida ou expirou.",
  troca_de_outro_colaborador: "Esta troca não é sua.",
};

/** Grava a assinatura digital de quem pede ou aceita a troca (servidor decide o papel; imutável). */
export async function assinarTroca(trocaId: string, assinatura: string): Promise<void> {
  const { error } = await (supabase.rpc as any)("dp_troca_assinar", { p_id: trocaId, p_assinatura: assinatura });
  if (error) {
    const chave = Object.keys(FRASES).find((k) => String(error.message ?? "").includes(k));
    throw new Error(chave ? FRASES[chave] : "Não foi possível registrar sua assinatura na troca. Tente novamente em instantes.");
  }
  try {
    const { salvarAssinaturaNaConta } = await import("@/components/dp/AssinaturaCaptura");
    await salvarAssinaturaNaConta(assinatura);
  } catch { /* modelo da conta é opcional */ }
}
