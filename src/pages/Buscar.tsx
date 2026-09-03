import { useMemo, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";
import { searchIndex, SEARCH_INDEX } from "@/lib/search-index";

export default function Buscar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQ);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  const results = useMemo(() => searchIndex(query), [query]);
  const trimmed = query.trim();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearchParams(trimmed ? { q: trimmed } : {});
  }

  const title = trimmed
    ? `Resultados para "${trimmed}" — Aveto 360`
    : "Buscar no Aveto 360";
  const description = trimmed
    ? `Resultados de busca para "${trimmed}" no site Aveto 360.`
    : "Busque por guias, planos e páginas do Aveto 360.";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        {trimmed && <meta name="robots" content="noindex,follow" />}
      </Helmet>
      <BreadcrumbJsonLd items={[{ name: "Buscar", path: "/buscar" }]} />

      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="container mx-auto flex h-14 items-center justify-between px-3 sm:h-16 sm:px-4">
          <Logo size="sm" linkTo="/" />
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
            </Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-6 sm:py-14">
        <h1 className="mb-4 sm:mb-6 text-xl sm:text-3xl font-bold tracking-tight">
          Buscar No Aveto 360
        </h1>

        <form onSubmit={onSubmit} role="search" className="mb-6 sm:mb-8 flex flex-col sm:flex-row gap-2">
          <label htmlFor="site-search" className="sr-only">
            Termo de busca
          </label>
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="site-search"
              name="q"
              type="search"
              autoFocus
              placeholder="Ex.: das mei, planos, privacidade..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          <Button type="submit" className="w-full sm:w-auto min-h-10">Buscar</Button>
        </form>

        {trimmed ? (
          results.length > 0 ? (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {results.map((r) => (
                <li key={r.path} className="p-4 hover:bg-muted/40">
                  <Link to={r.path} className="block">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {r.section}
                    </p>
                    <p className="mt-1 text-base font-semibold text-primary hover:underline">
                      {r.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {r.description}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      gestor360food.com{r.path}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
              <p className="text-base font-medium">
                Nenhum resultado para "{trimmed}".
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Tente outros termos como "das mei", "planos" ou "privacidade".
              </p>
            </div>
          )
        ) : (
          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Páginas populares
            </h2>
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {SEARCH_INDEX.map((doc) => (
                <li key={doc.path} className="p-4 hover:bg-muted/40">
                  <Link to={doc.path} className="block">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {doc.section}
                    </p>
                    <p className="mt-1 text-base font-semibold text-primary hover:underline">
                      {doc.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {doc.description}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Aveto 360
      </footer>
    </div>
  );
}
