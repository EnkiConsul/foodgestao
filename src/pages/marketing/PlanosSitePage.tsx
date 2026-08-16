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
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow tone="dark">Planos e condições</Eyebrow>
          <h1 id="planos-hero" className="mt-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            Você contrata só o que a sua operação precisa
          </h1>
          <p className="mt-4 text-base leading-relaxed text-white/75 sm:text-lg">
            Escolha entre Financeiro 360° e DP 360°, ou combine os dois. Sem pacotes fechados que você não vai usar.
          </p>
        </div>
      </Section>
      <PlansSection showComparison />
      <FaqSection scope="planos" />
      <FinalCtaSection />
    </SiteLayout>
  );
}
