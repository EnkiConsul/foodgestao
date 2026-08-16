import { SiteLayout } from "@/components/marketing/SiteLayout";
import { SiteSeo } from "@/components/marketing/SiteSeo";
import { Section, SectionHeading, SiteCard } from "@/components/marketing/primitives";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { DIFFERENTIALS } from "@/lib/marketing/content";

export default function QuemSomosPage() {
  return (
    <SiteLayout breadcrumbs={[{ name: "Quem somos", path: "/quem-somos" }]}>
      <SiteSeo
        title="Quem somos — 360°FOOD"
        description="O 360°FOOD nasceu para dar aos donos de bares, restaurantes e redes o controle financeiro e de pessoas que a operação exige."
        path="/quem-somos"
      />

      <Section variant="navy" labelledBy="quem-hero">
        <SectionHeading
          id="quem-hero"
          tone="dark"
          eyebrow="Quem somos"
          title="Tecnologia feita para quem vive o salão e a cozinha"
          description="Somos uma plataforma brasileira dedicada à gestão de negócios de alimentação. Unimos o controle do dinheiro e a gestão da equipe em um ecossistema modular, para que cada operação contrate exatamente o que precisa."
        />
      </Section>

      <Section labelledBy="quem-valores">
        <SectionHeading
          id="quem-valores"
          eyebrow="No que acreditamos"
          title="Gestão simples, informação confiável e time no centro"
        />
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {DIFFERENTIALS.slice(0, 4).map((item) => (
            <SiteCard key={item.title} as="li" className="h-full list-none">
              <p className="text-base font-extrabold text-site-ink">{item.title}</p>
              <p className="mt-2.5 text-sm leading-relaxed text-site-muted">{item.text}</p>
            </SiteCard>
          ))}
        </ul>
      </Section>

      <FinalCtaSection />
    </SiteLayout>
  );
}
