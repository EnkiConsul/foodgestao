import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCta, trackCta } from "@/lib/landing/utm";

export function CtaPrimary({
  utm,
  label = "Conheça a solução",
  source,
  className = "",
  size = "lg",
  extra,
}: {
  utm: string;
  label?: string;
  source: string;
  className?: string;
  size?: "default" | "sm" | "lg";
  extra?: Record<string, string>;
}) {
  const href = buildCta("/auth?tab=signup", utm, extra);
  return (
    <Button asChild size={size} className={className}>
      <Link to={href} onClick={() => trackCta(source, label)}>
        {label}
        <ArrowRight className="ml-1.5 h-4 w-4" />
      </Link>
    </Button>
  );
}
