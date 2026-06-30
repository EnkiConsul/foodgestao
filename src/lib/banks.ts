import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BankInfo {
  id?: string;
  slug: string;
  name: string;
  domain: string | null;
  logo_url?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export function getBankLogoUrl(bank?: Pick<BankInfo, "logo_url" | "domain"> | null, size = 64): string | null {
  if (!bank) return null;
  if (bank.logo_url) return bank.logo_url;
  if (!bank.domain) return null;
  const token = import.meta.env.VITE_LOVABLE_CONNECTOR_LOGO_DEV_API_KEY;
  if (!token) return null;
  return `https://img.logo.dev/${bank.domain}?token=${token}&size=${size}&format=png&fallback=monogram`;
}

export function useBanks(opts: { activeOnly?: boolean } = {}) {
  const { activeOnly = true } = opts;
  return useQuery({
    queryKey: ["banks", { activeOnly }],
    queryFn: async (): Promise<BankInfo[]> => {
      let q = supabase.from("banks" as never).select("*").order("sort_order").order("name");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as BankInfo[];
    },
    staleTime: 5 * 60_000,
  });
}

export function findBank(banks: BankInfo[] | undefined, slug?: string | null): BankInfo | undefined {
  if (!banks || !slug) return undefined;
  return banks.find((b) => b.slug === slug);
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tenta inferir o slug de um banco a partir de um texto livre (ex.: nome da conta).
 * Faz match longest-first contra `name` e `slug` dos bancos disponíveis.
 */
export function inferBankSlug(text: string | null | undefined, banks: BankInfo[] | undefined): string | null {
  if (!text || !banks || banks.length === 0) return null;
  const haystack = normalize(text);
  if (!haystack) return null;
  const candidates = banks
    .map((b) => {
      const needles = [normalize(b.name), normalize(b.slug)].filter(Boolean);
      const matchLen = needles.reduce((max, n) => (haystack.includes(n) ? Math.max(max, n.length) : max), 0);
      return { slug: b.slug, matchLen };
    })
    .filter((c) => c.matchLen > 0)
    .sort((a, b) => b.matchLen - a.matchLen);
  return candidates[0]?.slug ?? null;
}
