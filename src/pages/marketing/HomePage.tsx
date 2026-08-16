import { SiteLayout } from "@/components/marketing/SiteLayout";
import { SiteSeo, softwareApplicationLd } from "@/components/marketing/SiteSeo";
import { HeroSection } from "@/components/marketing/sections/HeroSection";
import { SolutionsSection } from "@/components/marketing/sections/SolutionsSection";
import { DifferentialsSection } from "@/components/marketing/sections/DifferentialsSection";
import { HowItWorksSection } from "@/components/marketing/sections/HowItWorksSection";
import { PlansSection } from "@/components/marketing/sections/PlansSection";
import { SocialProofSection } from "@/components/marketing/sections/SocialProofSection";
import { BlogTeaserSection } from "@/components/marketing/sections/BlogTeaserSection";
import { FaqSection } from "@/components/marketing/FaqSection";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";

export default function HomePage() {
  return (
    <SiteLayout>
      <SiteSeo
        title="360°FOOD — Gestão financeira e de pessoas para bares e restaurantes"
        description="Organize o financeiro e o departamento pessoal do seu bar, restaurante ou rede em um só ecossistema. Contratação modular, multiempresa e acesso pelo navegador."
        path="/"
        jsonLd={softwareApplicationLd(
          "360°FOOD",
          "Plataforma de gestão financeira e de departamento pessoal para bares, restaurantes e food service.",
          "/",
        )}
      />
      <HeroSection />
      <SolutionsSection />
      <DifferentialsSection />
      <HowItWorksSection />
      <PlansSection />
      <SocialProofSection />
      <BlogTeaserSection />
      <FaqSection scope="home" />
      <FinalCtaSection />
    </SiteLayout>
  );
}
