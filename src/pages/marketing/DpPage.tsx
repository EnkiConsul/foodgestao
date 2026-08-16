import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteLayout } from "@/components/marketing/SiteLayout";
import { SiteSeo, softwareApplicationLd } from "@/components/marketing/SiteSeo";
import { Eyebrow, Section, SectionHeading, SiteCard } from "@/components/marketing/primitives";
import { PillarsSection } from "@/components/marketing/sections/PillarsSection";
import { SocialProofSection } from "@/components/marketing/sections/SocialProofSection";
import { FaqSection } from "@/components/marketing/FaqSection";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { DP_PILLARS, ACCESS_PROFILES } from "@/lib/marketing/content";
import { withUtm } from "@/lib/marketing/utm";
import { trackEvent } from "@/lib/analytics";
import heroImage from "@/assets/site-equipe-turno.jpg";

export default function DpPage() {
  return (
    <SiteLayout breadcrumbs={[{ name: "Pessoas 360°", path: "/departamento-pessoal" }]}>
      <SiteSeo
        title="Pessoas 360° — Departamento pessoal para bares e restaurantes"
        description="Escalas, folgas, trocas, convocações, documentos e comunicação com a equipe do seu bar ou restaurante, com portal do colaborador no celular."
        path="/departamento-pessoal"
        jsonLd={[
          softwareApplicationLd(
            "Pessoas 360°",
            "Gestão de departamento pessoal para food service: escalas, folgas, documentos e portal do colaborador.",
            "/departamento-pessoal",
          ),
        ]}
      />

      <section className="bg-gradient-site-hero text-white" aria-labelledby="dp-hero">
        <div className="site-container grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Eyebrow tone="dark">Pessoas 360°</Eyebrow>
            <h1 id="dp-hero" className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              A equipe organizada no ritmo da operação
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/80">
              Escala publicada, folgas controladas, trocas registradas e documentos no lugar certo. O colaborador
              acompanha tudo pelo celular, e o gestor decide com informação atualizada.
            </p>
            <Button
              asChild
              size="lg"
              className="mt-8 h-12 bg-site-orange px-7 text-base font-bold text-site-orange-foreground hover:bg-site-orange/90"
              onClick={() => trackEvent("cta_click", { cta: "dp_hero" })}
            >
              <Link to={withUtm("/contato?solucao=dp")}>
                Falar com especialista
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <img
            src={heroImage}
            alt="Equipe de cozinha e salão trabalhando durante o turno de um restaurante"
            width={1280}
            height={960}
            loading="lazy"
            className="w-full rounded-site-lg border border-white/12 object-cover shadow-site-float"
          />
        </div>
      </section>

      <PillarsSection
        eyebrow="O que o Pessoas 360° resolve"
        title="Da escala do dia ao histórico do colaborador"
        description="Rotinas de pessoas desenhadas para operações que funcionam à noite, no fim de semana e em feriados."
        pillars={DP_PILLARS}
      />

      <Section variant="surface" labelledBy="dp-acessos-title">
        <SectionHeading
          id="dp-acessos-title"
          eyebrow="Portal do colaborador"
          title="Cada pessoa vê o que precisa, no celular"
          description="Sem grupos de WhatsApp perdidos: a equipe consulta escala, envia solicitações e recebe documentos direto na plataforma."
        />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {ACCESS_PROFILES.map((profile) => (
            <SiteCard key={profile.role} as="li" className="h-full list-none">
              <p className="text-sm font-extrabold text-site-ink">{profile.role}</p>
              <p className="mt-2 text-sm leading-relaxed text-site-muted">{profile.text}</p>
            </SiteCard>
          ))}
        </ul>
      </Section>

      <Section labelledBy="dp-planos-title">
        <SectionHeading
          id="dp-planos-title"
          eyebrow="Planos"
          title="Condições de acordo com o tamanho da sua equipe"
          description="Os planos do Pessoas 360° consideram o número de colaboradores e unidades da operação."
        />
        <div className="mt-8 text-center">
          <Button
            asChild
            className="h-11 bg-site-navy px-6 font-bold text-site-navy-foreground hover:bg-site-navy/90"
            onClick={() => trackEvent("cta_click", { cta: "consulte_planos_dp" })}
          >
            <Link to={withUtm("/contato?solucao=dp")}>Consulte os planos</Link>
          </Button>
        </div>
      </Section>

      <SocialProofSection module="dp" />
      <FaqSection scope="dp" />
      <FinalCtaSection defaultInterest="dp" />
    </SiteLayout>
  );
}
