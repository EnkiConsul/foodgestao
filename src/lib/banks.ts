export interface BankInfo {
  slug: string;
  name: string;
  domain: string;
}

export const BRAZILIAN_BANKS: BankInfo[] = [
  { slug: "nubank", name: "Nubank", domain: "nubank.com.br" },
  { slug: "itau", name: "Itaú", domain: "itau.com.br" },
  { slug: "bradesco", name: "Bradesco", domain: "bradesco.com.br" },
  { slug: "santander", name: "Santander", domain: "santander.com.br" },
  { slug: "caixa", name: "Caixa Econômica Federal", domain: "caixa.gov.br" },
  { slug: "bb", name: "Banco do Brasil", domain: "bb.com.br" },
  { slug: "inter", name: "Banco Inter", domain: "bancointer.com.br" },
  { slug: "c6", name: "C6 Bank", domain: "c6bank.com.br" },
  { slug: "btg", name: "BTG Pactual", domain: "btgpactual.com" },
  { slug: "sicoob", name: "Sicoob", domain: "sicoob.com.br" },
  { slug: "sicredi", name: "Sicredi", domain: "sicredi.com.br" },
  { slug: "original", name: "Banco Original", domain: "original.com.br" },
  { slug: "next", name: "Next", domain: "next.me" },
  { slug: "picpay", name: "PicPay", domain: "picpay.com" },
  { slug: "mercadopago", name: "Mercado Pago", domain: "mercadopago.com.br" },
  { slug: "will", name: "Will Bank", domain: "willbank.com.br" },
  { slug: "neon", name: "Neon", domain: "neon.com.br" },
  { slug: "pan", name: "Banco Pan", domain: "bancopan.com.br" },
  { slug: "safra", name: "Safra", domain: "safra.com.br" },
  { slug: "xp", name: "XP Investimentos", domain: "xpi.com.br" },
  { slug: "rico", name: "Rico", domain: "rico.com.vc" },
  { slug: "modal", name: "Modalmais", domain: "modalmais.com.br" },
  { slug: "banrisul", name: "Banrisul", domain: "banrisul.com.br" },
  { slug: "votorantim", name: "Banco BV", domain: "bv.com.br" },
  { slug: "daycoval", name: "Daycoval", domain: "daycoval.com.br" },
  { slug: "ame", name: "Ame Digital", domain: "amedigital.com" },
  { slug: "pagseguro", name: "PagBank", domain: "pagseguro.uol.com.br" },
  { slug: "stone", name: "Stone", domain: "stone.com.br" },
];

export function getBankBySlug(slug?: string | null): BankInfo | undefined {
  if (!slug) return undefined;
  return BRAZILIAN_BANKS.find((b) => b.slug === slug);
}

export function getBankLogoUrl(slug?: string | null, size = 64): string | null {
  const bank = getBankBySlug(slug);
  if (!bank) return null;
  const token = import.meta.env.VITE_LOVABLE_CONNECTOR_LOGO_DEV_API_KEY;
  if (!token) return null;
  return `https://img.logo.dev/${bank.domain}?token=${token}&size=${size}&format=png&fallback=monogram`;
}
