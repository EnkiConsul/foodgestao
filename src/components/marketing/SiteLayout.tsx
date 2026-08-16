import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { Button } from "@/components/ui/button";
import { captureUtm, withUtm } from "@/lib/marketing/utm";
import { trackEvent } from "@/lib/analytics";
import { BreadcrumbJsonLd, type BreadcrumbItem } from "@/components/seo/BreadcrumbJsonLd";

type Props = {
  children: ReactNode;
  /** Breadcrumbs das páginas internas (sem incluir "Início"). */
  breadcrumbs?: BreadcrumbItem[];
  /** Rótulo do CTA fixo no mobile. */
  stickyCtaLabel?: string;
  stickyCtaTo?: string;
};

export function SiteLayout({
  children,
  breadcrumbs,
  stickyCtaLabel = "Começar agora",
  stickyCtaTo = "/contato",
}: Props) {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    captureUtm();
  }, []);

  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [pathname, hash]);

  return (
    <div className="flex min-h-screen flex-col bg-background font-marketing text-site-ink">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-site-orange focus:px-4 focus:py-2 focus:font-bold focus:text-site-orange-foreground"
      >
        Ir para o conteúdo
      </a>
      <SiteHeader />

      {breadcrumbs && breadcrumbs.length > 0 && (
        <>
          <BreadcrumbJsonLd items={breadcrumbs} />
          <nav aria-label="Você está aqui" className="border-b border-site-line bg-site-surface">
            <ol className="site-container flex flex-wrap items-center gap-1 py-3 text-xs text-site-muted">
              <li>
                <Link to="/" className="hover:text-site-orange">
                  Início
                </Link>
              </li>
              {breadcrumbs.map((crumb, index) => (
                <li key={crumb.path} className="flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  {index === breadcrumbs.length - 1 ? (
                    <span className="font-semibold text-site-ink" aria-current="page">
                      {crumb.name}
                    </span>
                  ) : (
                    <Link to={crumb.path} className="hover:text-site-orange">
                      {crumb.name}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </>
      )}

      <main id="conteudo" className="flex-1">
        {children}
      </main>

      <SiteFooter />

      {/* CTA fixo no mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-site-line bg-card/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <Button
          asChild
          className="h-11 w-full bg-site-orange font-bold text-site-orange-foreground hover:bg-site-orange/90"
          onClick={() => trackEvent("cta_click", { cta: "sticky_mobile", origem: pathname })}
        >
          <Link to={withUtm(stickyCtaTo)}>{stickyCtaLabel}</Link>
        </Button>
      </div>
      <div className="h-16 lg:hidden" aria-hidden />
    </div>
  );
}
