import { supabase } from "@/integrations/supabase/client";

export const NATUREZAS_RECIBO = [
  { value: "acerto_mensal", label: "Acerto Mensal", ajuda: "Pagamento do mês de freelancer mensalista (faz o papel do contracheque)." },
  { value: "adiantamento", label: "Adiantamento", ajuda: "Adiantamento quinzenal ou pontual." },
  { value: "diaria", label: "Diária / Extra", ajuda: "Diária de freelancer ou extra em evento." },
  { value: "teste_operacional", label: "Teste Operacional Remunerado", ajuda: "Dia de teste prático de candidato." },
  { value: "outros", label: "Outros Pagamentos", ajuda: "Bônus, ajuda de custo, reembolso e outros." },
] as const;
export type NaturezaRecibo = (typeof NATUREZAS_RECIBO)[number]["value"];
export const NATUREZA_RECIBO_LABEL = Object.fromEntries(
  NATUREZAS_RECIBO.map((n) => [n.value, n.label]),
) as Record<NaturezaRecibo, string>;

export const CANAIS_ASSINATURA = [
  { value: "portal", label: "Portal do Colaborador", ajuda: "Assina no aplicativo, com login." },
  { value: "whatsapp", label: "Link pelo WhatsApp", ajuda: "Recebe um link e assina confirmando o CPF, sem aplicativo." },
  { value: "fisico", label: "Assinar à Mão", ajuda: "Baixe o PDF, imprima e colha a assinatura." },
] as const;
export type CanalAssinatura = (typeof CANAIS_ASSINATURA)[number]["value"];

export function ehNatureza(v?: string | null): v is NaturezaRecibo {
  return NATUREZAS_RECIBO.some((n) => n.value === v);
}

/** Valor sugerido da ficha: salário base (+ prêmio de assiduidade no acerto mensal). */
export function valorSugeridoCents(
  colab: { salario_base?: number | string | null; valor_diaria?: number | string | null; premio_assiduidade?: boolean | null; premio_assiduidade_valor?: number | string | null } | null,
  natureza: NaturezaRecibo,
): number | null {
  if (!colab) return null;
  const n = (v: unknown) => (v == null || v === "" ? 0 : Number(v));
  if (natureza === "diaria") return n(colab.valor_diaria) > 0 ? Math.round(n(colab.valor_diaria) * 100) : null;
  if (natureza === "acerto_mensal") {
    const base = n(colab.salario_base);
    if (base <= 0) return null;
    const premio = colab.premio_assiduidade ? n(colab.premio_assiduidade_valor) : 0;
    return Math.round((base + premio) * 100);
  }
  return null;
}

/** Link wa.me com a mensagem do recibo (número com DDI 55 quando faltar). */
export function whatsappUrl(numero: string | null | undefined, nome: string, link: string): string {
  let d = String(numero ?? "").replace(/\D+/g, "");
  if (d && d.length <= 11) d = `55${d}`;
  const primeiro = nome.split(" ")[0] ?? "";
  const nomeFmt = primeiro ? primeiro.charAt(0) + primeiro.slice(1).toLowerCase() : "";
  const texto = `Olá${nomeFmt ? `, ${nomeFmt}` : ""}! Segue o seu recibo de pagamento para conferência e assinatura digital: ${link}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
}

async function erroDe(error: unknown, fallback: string): Promise<Error> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const j = await ctx.json();
      if (j?.error) return new Error(String(j.error));
    } catch { /* sem corpo */ }
  }
  return new Error(fallback);
}

export type EmitirReciboEntrada = {
  company_id: string;
  colaborador_id?: string | null;
  beneficiario_nome?: string;
  beneficiario_cpf?: string;
  beneficiario_whatsapp?: string;
  natureza: NaturezaRecibo;
  descricao?: string;
  competencia: string;
  pago_em: string;
  valor_cents: number;
  modalidade: "bancario" | "especie" | "misto";
  valor_bancario_cents?: number | null;
  valor_especie_cents?: number | null;
  canal_assinatura: CanalAssinatura;
};

export type EmitirReciboSaida = {
  recibo_id: string;
  documento_id: string | null;
  whatsapp: string | null;
  link?: string;
  expira_em?: string;
};

export async function emitirRecibo(dados: EmitirReciboEntrada): Promise<EmitirReciboSaida> {
  const { data, error } = await supabase.functions.invoke("dp-recibo-emitir", { body: { acao: "emitir", ...dados } });
  if (error) throw await erroDe(error, "Não foi possível emitir o recibo.");
  return data as EmitirReciboSaida;
}

export async function gerarLinkRecibo(reciboId: string): Promise<{ link: string; whatsapp: string | null }> {
  const { data, error } = await supabase.functions.invoke("dp-recibo-emitir", { body: { acao: "link", recibo_id: reciboId } });
  if (error) throw await erroDe(error, "Não foi possível gerar o link.");
  return data as { link: string; whatsapp: string | null };
}

export async function cancelarRecibo(reciboId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("dp-recibo-emitir", { body: { acao: "cancelar", recibo_id: reciboId } });
  if (error) throw await erroDe(error, "Não foi possível cancelar o recibo.");
}

export async function reciboPdfUrl(reciboId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("dp-recibo-emitir", { body: { acao: "pdf", recibo_id: reciboId } });
  if (error) throw await erroDe(error, "Não foi possível abrir o recibo.");
  const blob = data instanceof Blob ? data : new Blob([data as ArrayBuffer], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

export function statusRecibo(r: { cancelado_em?: string | null; assinado_em?: string | null; canal_assinatura: string; link_expira_em?: string | null }): { label: string; tom: "ok" | "pendente" | "neutro" } {
  if (r.cancelado_em) return { label: "Cancelado", tom: "neutro" };
  if (r.assinado_em) return { label: "Assinado", tom: "ok" };
  if (r.canal_assinatura === "fisico") return { label: "Assinar à Mão", tom: "pendente" };
  if (r.canal_assinatura === "whatsapp" && r.link_expira_em && new Date(r.link_expira_em) < new Date()) {
    return { label: "Link Expirado", tom: "pendente" };
  }
  return { label: "Aguardando Assinatura", tom: "pendente" };
}
