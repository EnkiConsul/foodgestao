import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Helmet } from "react-helmet-async";
import { Logo } from "@/components/Logo";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";

type Props = {
  title: string;
  lastUpdated?: string;
  body: string;
  metaDescription?: string;
  canonicalPath: string;
};

export function LegalDocumentView({ title, lastUpdated, body, metaDescription, canonicalPath }: Props) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>{title} — Aveto 360</title>
        <meta name="description" content={metaDescription ?? `${title} — Aveto 360`} />
        <meta property="og:title" content={`${title} — Aveto 360`} />
        <meta property="og:description" content={metaDescription ?? `${title} — Aveto 360`} />
        <meta property="og:type" content="article" />
        <meta name="twitter:title" content={`${title} — Aveto 360`} />
        <meta name="twitter:description" content={metaDescription ?? `${title} — Aveto 360`} />
      </Helmet>
      <BreadcrumbJsonLd items={[{ name: title, path: canonicalPath }]} />

      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="container mx-auto flex h-14 items-center justify-between px-3 sm:h-16 sm:px-4">
          <Logo size="sm" linkTo="/" />
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-6 sm:py-14">
        {lastUpdated && (
          <p className="mb-4 sm:mb-6 text-xs uppercase tracking-wider text-muted-foreground">
            Última atualização: {new Date(lastUpdated).toLocaleDateString("pt-BR")}
          </p>
        )}
        <article className="prose prose-sm sm:prose-base prose-slate max-w-none dark:prose-invert prose-headings:tracking-tight prose-h1:text-xl sm:prose-h1:text-3xl prose-h1:font-bold prose-h2:text-lg sm:prose-h2:text-xl prose-h2:mt-6 sm:prose-h2:mt-8 prose-h3:text-base prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-li:my-1 prose-p:my-2 sm:prose-p:my-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </article>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link to="/privacidade" className="hover:text-foreground">Privacidade</Link>
          <Link to="/termos" className="hover:text-foreground">Termos</Link>
          <Link to="/cookies" className="hover:text-foreground">Cookies</Link>
          <Link to="/encarregado-dados" className="hover:text-foreground">DPO</Link>
        </div>
        <p className="mt-3">© {new Date().getFullYear()} Aveto 360</p>
      </footer>
    </div>
  );
}
