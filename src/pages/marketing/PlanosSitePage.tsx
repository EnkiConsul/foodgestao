import { SiteLayout } from "@/components/marketing/SiteLayout";
import { SiteSeo } from "@/components/marketing/SiteSeo";
import { Section, SectionHeading } from "@/components/marketing/primitives";
import { PlansSection } from "@/components/marketing/sections/PlansSection";
import { FaqSection } from "@/components/marketing/FaqSection";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";

export default function PlanosSitePage() {
  return (
    <SiteLayout breadcrumbs={[{ name: "Planos", path: "/planos" }]}>
      <SiteSeo
        title="Planos do 360°FOOD — Financeiro e DP para food service"
        description="Conheça os planos Essencial, Gestão e Multiempresa do Financeiro 360°, o programa Fidelidade 360 e as condições do DP 360°."
        path="/planos"
      />
      <Section variant="navy" labelledBy="planos-hero">
        <SectionHeading
          id="planos-hero"
          tone="dark"
          eyebrow="Planos e condições"
          title="Você contrata só o que a sua operação precisa"
          description="Escolha entre Financeiro 360° e DP 360°, ou combine os dois. Sem pacotes fechados que você não vai usar."
        />
      </Section>
      <PlansSection showComparison />
      <FaqSection scope="planos" />
      <FinalCtaSection />
    </SiteLayout>
  );
}
