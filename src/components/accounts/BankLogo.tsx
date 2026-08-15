import { useState } from "react";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { findBank, getBankLogoUrl, inferBankSlug, useBanks } from "@/lib/banks";
import brandSymbol from "@/assets/360food-symbol.png.asset.json";

interface BankLogoProps {
  slug?: string | null;
  /** Texto livre (ex.: nome da conta) usado para inferir o banco quando slug é nulo. */
  fallbackName?: string | null;
  size?: number;
  className?: string;
  fallbackColor?: string;
}

/** Contas de dinheiro em espécie não pertencem a nenhum banco — usam a marca 360°FOOD. */
function isCashAccountName(text?: string | null): boolean {
  if (!text) return false;
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/economica|federal|cef|cx economica/.test(t)) return false;
  return /^(caixa|caixa geral|caixa interno|caixa loja|dinheiro|especie|carteira|cofre)\b/.test(t);
}

export function BankLogo({ slug, fallbackName, size = 40, className, fallbackColor }: BankLogoProps) {
  const { data: banks } = useBanks();
  const cashAccount = !slug && isCashAccountName(fallbackName);
  const effectiveSlug = slug || (cashAccount ? null : inferBankSlug(fallbackName, banks));
  const bank = findBank(banks, effectiveSlug);
  const url = getBankLogoUrl(bank, size * 2);
  const [errored, setErrored] = useState(false);

  if (cashAccount) {
    return (
      <img
        src={brandSymbol.url}
        alt="360°FOOD"
        loading="lazy"
        className={cn("rounded-lg object-contain bg-white border p-1", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  if (!url || errored) {
    return (
      <div
        className={cn("flex items-center justify-center rounded-lg", className)}
        style={{
          width: size,
          height: size,
          backgroundColor: fallbackColor ? `${fallbackColor}20` : "hsl(var(--primary) / 0.1)",
        }}
      >
        <Wallet className="h-1/2 w-1/2" style={{ color: fallbackColor || "hsl(var(--primary))" }} />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setErrored(true)}
      className={cn("rounded-lg object-contain bg-white border", className)}
      style={{ width: size, height: size }}
    />
  );
}
