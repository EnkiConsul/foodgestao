import { ContactSection } from "@/components/landing/ContactSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { FeaturesGrid } from "@/components/landing/FeaturesGrid";
import { FinalCta } from "@/components/landing/FinalCta";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
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

export default function Landing() {
  const utm = useUtmQuery();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader utm={utm} />
      <main>
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


      <PublicFooter />
      <WhatsappButton message="Olá! Vim pelo site e gostaria de saber mais sobre o 360°FOOD." />
    </div>
  );
}

