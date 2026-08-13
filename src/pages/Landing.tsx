import { ContactSection } from "@/components/landing/ContactSection";
import { ComparisonSection } from "@/components/landing/ComparisonSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { FeaturesGrid } from "@/components/landing/FeaturesGrid";
import { FinalCta } from "@/components/landing/FinalCta";
import { GuaranteeStrip } from "@/components/landing/GuaranteeStrip";
import { HeroSection } from "@/components/landing/HeroSection";
import { ModulesSection } from "@/components/landing/ModulesSection";
import { PersonaCards } from "@/components/landing/PersonaCards";
import { PersonasStrip } from "@/components/landing/PersonasStrip";
import { PricingSection } from "@/components/landing/PricingSection";
import { PublicFooter } from "@/components/landing/PublicFooter";
import { PublicHeader } from "@/components/landing/PublicHeader";
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
        <ComparisonSection utm={utm} />
        <PersonaCards utm={utm} />
        <FeaturesGrid />
        <GuaranteeStrip utm={utm} />
        <PricingSection utm={utm} />
        <FaqSection />
        <ContactSection />
        <FinalCta utm={utm} />
      </main>
      <PublicFooter />
      <WhatsappButton message="Olá! Vim pelo site e gostaria de saber mais sobre o 360°FOOD." />
    </div>
  );
}
