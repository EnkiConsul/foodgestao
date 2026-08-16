import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteLayout } from "@/components/marketing/SiteLayout";
import { SiteSeo, softwareApplicationLd } from "@/components/marketing/SiteSeo";
import { Eyebrow, Section, SectionHeading, SiteCard } from "@/components/marketing/primitives";
import { PillarsSection } from "@/components/marketing/sections/PillarsSection";
import { PlansSection } from "@/components/marketing/sections/PlansSection";
import { SocialProofSection } from "@/components/marketing/sections/SocialProofSection";
import { FaqSection } from "@/components/marketing/FaqSection";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { FINANCE_PILLARS, COST_CENTER_EXAMPLES } from "@/lib/marketing/content";
import { withUtm } from "@/lib/marketing/utm";
import { trackEvent } from "@/lib/analytics";
import heroImage from "@/assets/site-gestor-indicadores.jpg";

export default function FinanceiroPage() {
  return (
    <SiteLayout breadcrumbs={[{ name: "Financeiro 360°", url: "/financeiro" }]}>
      <SiteSeo
        title="Financeiro 360° — Gestão financeira para bares e restaurantes"
        description="Lançamentos, conciliação bancária com Open Finance, fluxo de caixa e DRE gerencial para bares, restaurantes e redes. Multiempresa e acesso por perfil."
        path="/financeiro"
        jsonLd={[
          softwareApplicationLd(
            "Financeiro 360°",
            "Gestão financeira para bares, restaurantes e food service: lançamentos, conciliação, fluxo de caixa e DRE gerencial.",
            "/financeiro",
          ),
        ]}
      />

      <section className="bg-gradient-site-hero text-white" aria-labelledby="fin-hero">
        <div className="site-container grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Eyebrow tone="dark">Financeiro 360°</Eyebrow>
            <h1 id="fin-hero" className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Clareza total sobre o dinheiro do seu negócio
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/80">
              Centralize lançamentos, contas a pagar e receber, conciliação bancária e resultados. Saiba quanto entra,
              quanto sai e quanto sobra — por unidade, categoria e centro de custo.
            </p>
            <Button
              asChild
              size="lg"
              className="mt-8 h-12 bg-site-orange px-7 text-base font-bold text-site-orange-foreground hover:bg-site-orange/90"
              onClick={() => trackEvent("cta_click", { cta: "financeiro_hero" })}
            >
              <Link to={withUtm("/contato?solucao=financeiro")}>
                Falar com especialista
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <img
            src={heroImage}
            alt="Gestora de restaurante analisando indicadores financeiros do negócio"
            width={1280}
            height={960}
            loading="lazy"
            className="w-full rounded-site-lg border border-white/12 object-cover shadow-site-float"
          />
        </div>
      </section>

      <PillarsSection
        eyebrow="O que você faz na plataforma"
        title="Do lançamento do dia ao resultado do mês"
        description="Recursos organizados pela rotina real de uma operação de alimentação."
        pillars={FINANCE_PILLARS}
      />

      <Section variant="surface" labelledBy="centros-title">
        <SectionHeading
          id="centros-title"
          eyebrow="Centros de custo"
          title="Enxergue o resultado por área da operação"
          description="Separe receitas e despesas por frente de trabalho e descubra onde a margem se perde."
        />
        <ul className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-3">
          {COST_CENTER_EXAMPLES.map((item) => (
            <li
              key={item}
              className="rounded-full border border-site-line bg-card px-4 py-2 text-sm font-bold text-site-ink shadow-site-card"
            >
              {item}
            </li>
          ))}
        </ul>
        <div className="mx-auto mt-10 max-w-3xl">
          <SiteCard>
            <p className="text-sm leading-relaxed text-site-muted">
              Com contas conectadas por Open Finance ou importação de extrato, as movimentações chegam prontas para
              conciliar — e a IA assistida sugere a categoria com base no seu histórico, reduzindo digitação.
            </p>
          </SiteCard>
        </div>
      </Section>

      <PlansSection defaultTab="financeiro" />
      <SocialProofSection module="financeiro" />
      <FaqSection scope="financeiro" />
      <FinalCtaSection defaultInterest="financeiro" />
    </SiteLayout>
  );
}
