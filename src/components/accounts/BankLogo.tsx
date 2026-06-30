import { useState } from "react";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBankLogoUrl } from "@/lib/banks";

interface BankLogoProps {
  slug?: string | null;
  size?: number;
  className?: string;
  fallbackColor?: string;
}

export function BankLogo({ slug, size = 40, className, fallbackColor }: BankLogoProps) {
  const url = getBankLogoUrl(slug, size * 2);
  const [errored, setErrored] = useState(false);

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
