import { Link, useParams } from "react-router-dom";
import { SiteLayout } from "@/components/marketing/SiteLayout";
import { SiteSeo } from "@/components/marketing/SiteSeo";
import { Section, SiteCard } from "@/components/marketing/primitives";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { useMktCase } from "@/hooks/useMarketingContent";

export default function CaseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: item, isLoading } = useMktCase(slug);

  if (isLoading) {
    return (
      <SiteLayout>
        <Section>
          <p className="text-center text-sm text-site-muted">Carregando case...</p>
        </Section>
      </SiteLayout>
    );
  }

  if (!item) {
    return (
      <SiteLayout breadcrumbs={[{ name: "Cases", path: "/cases" }]}>
        <SiteSeo title="Case não encontrado — 360°FOOD" description="Este case não está disponível." path="/cases" noindex />
        <Section>
          <p className="text-center text-sm text-site-muted">
            Este case não está disponível.{" "}
            <Link to="/cases" className="font-bold text-site-orange hover:underline">
              Ver todos os cases
            </Link>
          </p>
        </Section>
      </SiteLayout>
    );
  }

  const blocks = [
    { label: "Desafio", value: item.challenge },
    { label: "Solução", value: item.solution },
    { label: "Resultado", value: item.result },
  ].filter((block) => !!block.value);

  return (
    <SiteLayout
      breadcrumbs={[
        { name: "Cases", path: "/cases" },
        { name: item.title, path: `/cases/${item.slug}` },
      ]}
    >
      <SiteSeo
        title={item.seo_title ?? `${item.title} — Case 360°FOOD`}
        description={item.seo_description ?? item.result ?? "Case de cliente 360°FOOD."}
        path={`/cases/${item.slug}`}
        type="article"
      />

      <Section labelledBy="case-title">
        <article className="mx-auto max-w-3xl">
          {item.segment && <p className="text-xs font-bold uppercase tracking-wide text-site-orange">{item.segment}</p>}
          <h1 id="case-title" className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            {item.title}
          </h1>
          {item.company_name && <p className="mt-3 text-sm font-semibold text-site-muted">{item.company_name}</p>}

          {item.cover_url && (
            <img
              src={item.cover_url}
              alt={item.cover_alt ?? item.title}
              loading="lazy"
              className="mt-8 w-full rounded-site-lg border border-site-line object-cover"
            />
          )}

          <div className="mt-10 space-y-5">
            {blocks.map((block) => (
              <SiteCard key={block.label}>
                <p className="text-sm font-extrabold uppercase tracking-wide text-site-orange">{block.label}</p>
                <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-site-ink">{block.value}</p>
              </SiteCard>
            ))}
          </div>

          {item.body && (
            <div className="mt-10 whitespace-pre-line text-base leading-relaxed text-site-ink">{item.body}</div>
          )}
        </article>
      </Section>

      <FinalCtaSection />
    </SiteLayout>
  );
}
