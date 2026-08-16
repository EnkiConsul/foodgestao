import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { useLandingSection } from "@/hooks/useLandingContent";
import { buildCta } from "@/lib/landing/utm";
import { handleAnchorClick } from "@/lib/landing/scroll";
import { CtaPrimary } from "./CtaPrimary";

export function PublicHeader({ utm }: { utm: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const c = useLandingSection("nav");

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="container mx-auto flex h-14 items-center justify-between px-3 sm:h-16 sm:px-4">
        <Logo size="sm" variant="symbol" linkTo="/" className="h-9 sm:h-10" />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Navegação principal">
          {c.items.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              onClick={(e) => handleAnchorClick(e, l.href)}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to={buildCta("/auth", utm)}>{c.cta_login}</Link>
          </Button>
          <CtaPrimary
            utm={utm}
            source="header"
            label={c.cta_primary}
            size="sm"
            className="hidden sm:flex h-9 px-3 text-xs sm:text-sm"
          />

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen((s) => !s)}
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <XIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-border/60 bg-background/95 backdrop-blur-md md:hidden">
          <nav className="container mx-auto flex flex-col px-3 py-2" aria-label="Navegação principal">
            {c.items.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                onClick={(e) => handleAnchorClick(e, l.href, () => setMobileOpen(false))}
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-border/60 px-3 pt-3">
              <Button asChild variant="ghost" size="sm" className="justify-start">
                <Link to={buildCta("/auth", utm)}>{c.cta_login}</Link>
              </Button>
              <CtaPrimary
                utm={utm}
                source="header_mobile"
                label={c.cta_primary}
                size="sm"
                className="w-full"
              />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
