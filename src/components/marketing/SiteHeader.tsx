import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, X, ChevronDown, Wallet, Users } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SOLUTIONS } from "@/lib/marketing/content";
import { withUtm } from "@/lib/marketing/utm";
import { trackEvent } from "@/lib/analytics";

const NAV = [
  { label: "Diferenciais", to: "/#diferenciais" },
  { label: "Planos", to: "/planos" },
  { label: "Cases", to: "/cases" },
  { label: "Blog", to: "/blog" },
  { label: "Quem somos", to: "/quem-somos" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setSolutionsOpen(false);
  }, [location.pathname, location.hash]);

  const ctaClick = (origem: string) => trackEvent("cta_click", { cta: "comecar_agora", origem });

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-white/10 bg-site-navy/95 backdrop-blur transition-all duration-200",
        scrolled ? "py-1.5 shadow-site-float" : "py-3",
      )}
    >
      <div className="site-container flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center" aria-label="360°FOOD — página inicial">
          <Logo linkTo={null} size="sm" className={cn("transition-all", scrolled ? "h-8" : "h-9")} />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navegação principal">
          <div
            className="relative"
            onMouseEnter={() => setSolutionsOpen(true)}
            onMouseLeave={() => setSolutionsOpen(false)}
          >
            <button
              type="button"
              aria-expanded={solutionsOpen}
              onClick={() => setSolutionsOpen((v) => !v)}
              className="flex items-center gap-1 rounded-site-md px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-orange"
            >
              Soluções
              <ChevronDown className={cn("h-4 w-4 transition-transform", solutionsOpen && "rotate-180")} />
            </button>
            {solutionsOpen && (
              <div className="absolute left-0 top-full w-[26rem] pt-2">
                <div className="grid gap-1 rounded-site-lg border border-site-line bg-card p-2 shadow-site-float">
                  {SOLUTIONS.map((solution) => (
                    <Link
                      key={solution.key}
                      to={withUtm(solution.route)}
                      className="flex gap-3 rounded-site-md p-3 transition-colors hover:bg-site-surface"
                    >
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-site-md bg-accent text-accent-foreground">
                        {solution.key === "financeiro" ? (
                          <Wallet className="h-4 w-4" />
                        ) : (
                          <Users className="h-4 w-4" />
                        )}
                      </span>
                      <span>
                        <span className="block text-sm font-bold text-site-ink">{solution.name}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-site-muted">
                          {solution.key === "financeiro"
                            ? "Contas, bancos, caixa, DRE e relatórios."
                            : "Escalas, folgas, documentos e comunicação."}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={withUtm(item.to)}
              className={({ isActive }) =>
                cn(
                  "rounded-site-md px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-orange",
                  isActive && !item.to.includes("#") && "bg-white/10 text-white",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Button asChild variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
            <Link to="/auth">Entrar</Link>
          </Button>
          <Button
            asChild
            className="bg-site-orange font-bold text-site-orange-foreground hover:bg-site-orange/90"
            onClick={() => ctaClick("header")}
          >
            <Link to={withUtm("/contato")}>Começar agora</Link>
          </Button>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10 hover:text-white lg:hidden"
              aria-label="Abrir menu"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[86vw] max-w-sm bg-site-navy text-white">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="mt-2 flex flex-col gap-1">
              <p className="px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-white/50">Soluções</p>
              {SOLUTIONS.map((solution) => (
                <Link
                  key={solution.key}
                  to={withUtm(solution.route)}
                  className="rounded-site-md px-3 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/10"
                >
                  {solution.name}
                </Link>
              ))}
              <p className="px-3 pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-white/50">Navegar</p>
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={withUtm(item.to)}
                  className="rounded-site-md px-3 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/10"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                to="/contato"
                className="rounded-site-md px-3 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/10"
              >
                Contato
              </Link>
              <div className="mt-4 grid gap-2 px-1">
                <Button
                  asChild
                  className="w-full bg-site-orange font-bold text-site-orange-foreground hover:bg-site-orange/90"
                  onClick={() => ctaClick("menu_mobile")}
                >
                  <Link to={withUtm("/contato")}>Começar agora</Link>
                </Button>
                <Button asChild variant="outline" className="w-full border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                  <Link to="/auth">Entrar</Link>
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
