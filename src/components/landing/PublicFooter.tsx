import { Link } from "react-router-dom";
import { Instagram } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useLandingSection } from "@/hooks/useLandingContent";

export function PublicFooter() {
  const c = useLandingSection("footer");
  const copy = c.copyright.replace("{year}", String(new Date().getFullYear()));
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="container mx-auto px-4 py-8 sm:py-10">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <Logo size="sm" variant="symbol" linkTo="/" className="h-8" />
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <Link to="/auth" className="hover:text-foreground">{c.link_login}</Link>
            <a href="#modulos" className="hover:text-foreground">{c.link_plans}</a>
            <a href="#faq" className="hover:text-foreground">{c.link_faq}</a>
            <a href="#contato" className="hover:text-foreground">Contato</a>
            <a
              href="https://www.instagram.com/360food"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Instagram className="h-3.5 w-3.5" />
              @360food
            </a>
          </div>
        </div>

        <div className="mt-6 border-t border-border/60 pt-6">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Privacidade & Conformidade LGPD
            </p>
            <nav
              aria-label="Documentos legais"
              className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-medium text-foreground/80"
            >
              <Link to="/privacidade" className="hover:text-primary hover:underline underline-offset-4">{c.link_privacy}</Link>
              <Link to="/termos" className="hover:text-primary hover:underline underline-offset-4">{c.link_terms}</Link>
              <Link to="/cookies" className="hover:text-primary hover:underline underline-offset-4">{c.link_cookies}</Link>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("plin:cookie-settings-open"))}
                className="hover:text-primary hover:underline underline-offset-4"
              >
                {c.link_cookie_settings}
              </button>
              <Link to="/encarregado-dados" className="hover:text-primary hover:underline underline-offset-4">{c.link_dpo}</Link>
            </nav>
          </div>
          <p className="mt-4 text-center text-[11px] text-muted-foreground sm:text-left">{copy}</p>
        </div>
      </div>
    </footer>
  );
}
