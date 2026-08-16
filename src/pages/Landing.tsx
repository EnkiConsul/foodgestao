import { ContactSection } from "@/components/landing/ContactSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { FeaturesGrid } from "@/components/landing/FeaturesGrid";
import { FinalCta } from "@/components/landing/FinalCta";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { MobileCtaBar } from "@/components/landing/MobileCtaBar";
import { ModulesSection } from "@/components/landing/ModulesSection";
import { PainSection } from "@/components/landing/PainSection";
import { PersonasStrip } from "@/components/landing/PersonasStrip";
import { PublicFooter } from "@/components/landing/PublicFooter";
import { PublicHeader } from "@/components/landing/PublicHeader";
import { SegmentsSection } from "@/components/landing/SegmentsSection";
import { SolutionsSection } from "@/components/landing/SolutionsSection";
import { TrustSection } from "@/components/landing/TrustSection";
import { WhatsappButton } from "@/components/WhatsappButton";
import { useUtmQuery } from "@/lib/landing/utm";
import { Helmet } from "react-helmet-async";

const SEO_TITLE = "360°FOOD — Gestão financeira para bares e restaurantes";
const SEO_DESC =
  "Sistema de gestão para bares, restaurantes, pizzarias e redes: conciliação bancária via Open Finance, contas a pagar, fluxo de caixa, DRE e departamento pessoal.";

export default function Landing() {
  const utm = useUtmQuery();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>{SEO_TITLE}</title>
        <meta name="description" content={SEO_DESC} />
        <meta property="og:title" content={SEO_TITLE} />
        <meta property="og:description" content={SEO_DESC} />
        <meta name="twitter:title" content={SEO_TITLE} />
        <meta name="twitter:description" content={SEO_DESC} />
      </Helmet>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Ir para o conteúdo
      </a>
      <PublicHeader utm={utm} />
      <main id="conteudo">
        <HeroSection utm={utm} />
        <PersonasStrip />
        <PainSection />
        <SegmentsSection />
        <SolutionsSection utm={utm} />
        <ModulesSection />
        <FeaturesGrid />
        <HowItWorksSection />
        <TrustSection />
        <FaqSection />
        <ContactSection />
        <FinalCta utm={utm} />
      </main>
      <MobileCtaBar utm={utm} />


      <PublicFooter />
      <div className="h-16 md:hidden" aria-hidden="true" />
      <WhatsappButton message="Olá! Vim pelo site e gostaria de saber mais sobre o 360°FOOD." />
    </div>
  );
}

