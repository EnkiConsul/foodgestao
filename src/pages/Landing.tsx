import { ContactSection } from "@/components/landing/ContactSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { FeaturesGrid } from "@/components/landing/FeaturesGrid";
import { FinalCta } from "@/components/landing/FinalCta";
import { HeroSection } from "@/components/landing/HeroSection";
import { ModulesSection } from "@/components/landing/ModulesSection";
import { PersonasStrip } from "@/components/landing/PersonasStrip";
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
        <FeaturesGrid />
        <ModulesSection />
        <FaqSection />
        <ContactSection />
        <FinalCta utm={utm} />
      </main>
      <PublicFooter />
      <WhatsappButton message="Olá! Vim pelo site e gostaria de saber mais sobre o 360°FOOD." />
    </div>
  );
}

