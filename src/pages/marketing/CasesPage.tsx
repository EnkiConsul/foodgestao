import { Link } from "react-router-dom";
import { SiteLayout } from "@/components/marketing/SiteLayout";
import { SiteSeo } from "@/components/marketing/SiteSeo";
import { Section, SectionHeading, SiteCard } from "@/components/marketing/primitives";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { useMktCases } from "@/hooks/useMarketingContent";

export default function CasesPage() {
  const { data: cases = [], isLoading } = useMktCases();

  return (
    <SiteLayout breadcrumbs={[{ name: "Cases", path: "/cases" }]}>
      <SiteSeo
        title="Cases de clientes — 360°FOOD"
        description="Histórias de bares, restaurantes e redes que organizaram a gestão financeira e de pessoas com o 360°FOOD."
        path="/cases"
      />

      <Section labelledBy="cases-title">
        <SectionHeading
          id="cases-title"
          as="h1"
          eyebrow="Cases"
          title="Operações que colocaram a gestão em ordem"
          description="Desafio, solução e resultado de quem usa o 360°FOOD no dia a dia."
        />

        {isLoading ? (
          <p className="mt-12 text-center text-sm text-site-muted">Carregando cases...</p>
        ) : cases.length === 0 ? (
          <p className="mt-12 text-center text-sm text-site-muted">
            Estamos preparando os primeiros cases. Fale com nosso time para conhecer exemplos de operações parecidas com
            a sua.
          </p>
        ) : (
          <ul className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {cases.map((item) => (
              <SiteCard key={item.id} as="li" className="h-full list-none">
                {item.segment && (
                  <p className="text-xs font-bold uppercase tracking-wide text-site-orange">{item.segment}</p>
                )}
                <h2 className="mt-2 text-base font-extrabold leading-snug text-site-ink">
                  <Link to={`/cases/${item.slug}`} className="hover:text-site-orange">
                    {item.title}
                  </Link>
                </h2>
                {item.result && <p className="mt-2.5 text-sm leading-relaxed text-site-muted">{item.result}</p>}
              </SiteCard>
            ))}
          </ul>
        )}
      </Section>

      <FinalCtaSection />
    </SiteLayout>
  );
}
