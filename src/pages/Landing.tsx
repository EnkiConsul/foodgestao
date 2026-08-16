import { HeroSection } from "@/components/landing/HeroSection";
import { MobileCtaBar } from "@/components/landing/MobileCtaBar";
import { PersonasStrip } from "@/components/landing/PersonasStrip";
import { PublicFooter } from "@/components/landing/PublicFooter";
import { PublicHeader } from "@/components/landing/PublicHeader";
import { WhatsappButton } from "@/components/WhatsappButton";
import { useUtmQuery } from "@/lib/landing/utm";
import { Suspense, lazy } from "react";
import { Helmet } from "react-helmet-async";

const PainSection = lazy(() =>
  import("@/components/landing/PainSection").then((m) => ({ default: m.PainSection })),
);
const SegmentsSection = lazy(() =>
  import("@/components/landing/SegmentsSection").then((m) => ({ default: m.SegmentsSection })),
);
const SolutionsSection = lazy(() =>
  import("@/components/landing/SolutionsSection").then((m) => ({ default: m.SolutionsSection })),
);
const ModulesSection = lazy(() =>
  import("@/components/landing/ModulesSection").then((m) => ({ default: m.ModulesSection })),
);
const FeaturesGrid = lazy(() =>
  import("@/components/landing/FeaturesGrid").then((m) => ({ default: m.FeaturesGrid })),
);
const HowItWorksSection = lazy(() =>
  import("@/components/landing/HowItWorksSection").then((m) => ({ default: m.HowItWorksSection })),
);
const TrustSection = lazy(() =>
  import("@/components/landing/TrustSection").then((m) => ({ default: m.TrustSection })),
);
const FaqSection = lazy(() =>
  import("@/components/landing/FaqSection").then((m) => ({ default: m.FaqSection })),
);
const ContactSection = lazy(() =>
  import("@/components/landing/ContactSection").then((m) => ({ default: m.ContactSection })),
);
const FinalCta = lazy(() =>
  import("@/components/landing/FinalCta").then((m) => ({ default: m.FinalCta })),
);

const SectionFallback = () => <div className="h-64" aria-hidden="true" />;

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
        <Suspense fallback={<SectionFallback />}>
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
        </Suspense>

      </main>
      <MobileCtaBar utm={utm} />


      <PublicFooter />
      <div className="h-16 md:hidden" aria-hidden="true" />
      <WhatsappButton
        className="hidden md:flex"
        message="Olá! Vim pelo site e gostaria de saber mais sobre o 360°FOOD."
      />
    </div>
  );
}

