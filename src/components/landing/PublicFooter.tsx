import { Link } from "react-router-dom";
import { Instagram, MessageCircle, Mail } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useLandingSection } from "@/hooks/useLandingContent";
import { handleAnchorClick } from "@/lib/landing/scroll";

const WHATSAPP_URL =
  "https://wa.me/5562992365959?text=" +
  encodeURIComponent("Olá! Vim pelo site do 360°FOOD.");

const NAV_LINKS = [
  { label: "Soluções", href: "#solucoes" },
  { label: "Segmentos", href: "#segmentos" },
  { label: "Como funciona", href: "#como-funciona" },
  { label: "Módulos", href: "#modulos" },
];

export function PublicFooter() {
  const c = useLandingSection("footer");
  const copy = c.copyright.replace("{year}", String(new Date().getFullYear()));
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="container mx-auto px-4 py-10 sm:py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo size="sm" variant="symbol" linkTo="/" className="h-8" />
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              Gestão financeira e de equipe para bares, restaurantes, pizzarias, cafeterias e
              redes de unidades.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                (62) 99236-5959
              </a>
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

          <nav aria-label="Navegação do site" className="text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Navegar
            </h2>
            <ul className="mt-3 space-y-2 text-muted-foreground">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={(e) => handleAnchorClick(e, l.href)}
                    className="hover:text-foreground"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <a href="#faq" onClick={(e) => handleAnchorClick(e, "#faq")} className="hover:text-foreground">
                  {c.link_faq}
                </a>
              </li>
            </ul>
          </nav>

          <div className="text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Comece agora
            </h2>
            <ul className="mt-3 space-y-2 text-muted-foreground">
              <li>
                <Link to="/auth" className="hover:text-foreground">
                  {c.link_login}
                </Link>
              </li>
              <li>
                <Link to="/auth?tab=signup" className="hover:text-foreground">
                  Criar conta
                </Link>
              </li>
              <li>
                <a
                  href="#contato"
                  onClick={(e) => handleAnchorClick(e, "#contato")}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Falar com o time
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-border/60 pt-6">
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
