export type DestinoWhatsapp = "normal" | "business" | "web";

export function numeroWhatsapp(valor: string): string | null {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 15) return null;
  return digitos.length <= 11 ? `55${digitos}` : digitos;
}

/** Intent Android é uma tentativa explícita, com alternativa HTTPS oficial. */
export function linkWhatsapp(numero: string, mensagem: string, destino: DestinoWhatsapp = "web"): string | null {
  const telefone = numeroWhatsapp(numero);
  if (!telefone) return null;
  const texto = encodeURIComponent(mensagem);
  const web = `https://wa.me/${telefone}?text=${texto}`;
  if (destino === "web") return web;
  const pacote = destino === "business" ? "com.whatsapp.w4b" : "com.whatsapp";
  return `intent://send?phone=${telefone}&text=${texto}#Intent;scheme=whatsapp;package=${pacote};S.browser_fallback_url=${encodeURIComponent(web)};end`;
}