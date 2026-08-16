import { Section } from "../primitives";
import { LeadForm } from "../LeadForm";

export function FinalCtaSection({ defaultInterest }: { defaultInterest?: "financeiro" | "dp" | "ambos" }) {
  return (
    <Section id="contato" variant="navy" labelledBy="contato-title">
      <div className="grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h2 id="contato-title" className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            Vamos organizar a gestão do seu negócio de alimentação
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-white/75">
            Conte o momento da sua operação e nosso time mostra como o Financeiro 360° e o DP 360° se encaixam na sua
            rotina — sem compromisso.
          </p>
        </div>

        <div className="rounded-site-lg border border-white/12 bg-white/[0.06] p-6 backdrop-blur-sm sm:p-8">
          <LeadForm defaultInterest={defaultInterest} tone="dark" origin="home" />
        </div>
      </div>
    </Section>
  );
}
