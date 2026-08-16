import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Wallet, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "../primitives";
import heroImage from "@/assets/site-gestor-indicadores.jpg";
import { withUtm } from "@/lib/marketing/utm";
import { trackEvent } from "@/lib/analytics";

const PROOFS = ["Financeiro e Pessoas integrados", "Contratação modular", "Multiempresa", "Acesso pelo navegador"];

const MODULES = [
  {
    icon: Wallet,
    name: "Financeiro 360°",
    tagline: "O dinheiro do negócio sob controle",
    bullets: ["Contas a pagar e receber", "Extrato bancário conciliado", "DRE e fluxo de caixa"],
    to: "/financeiro",
    cta: "Ver Financeiro 360°",
    event: "hero_module_financeiro",
  },
  {
    icon: Users,
    name: "Pessoas 360°",
    tagline: "A equipe organizada e dentro da lei",
    bullets: ["Escala, ponto e folgas", "Folha, férias e benefícios", "Documentos e portal do colaborador"],
    to: "/departamento-pessoal",
    cta: "Ver Pessoas 360°",
    event: "hero_module_pessoas",
  },
];


export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-site-hero text-white" aria-labelledby="hero-title">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-site-orange/25 blur-3xl"
      />
      <div className="site-container relative grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
        <div>
          <Eyebrow tone="dark">Gestão para bares, restaurantes e food service</Eyebrow>
          <h1
            id="hero-title"
            className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]"
          >
            Gestão financeira e de pessoas para quem vive a operação
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/80">
            O 360°FOOD organiza o dinheiro e a equipe do seu negócio de alimentação em um único ecossistema, com
            contratação modular: comece pelo Financeiro, pelo Departamento Pessoal ou pelos dois.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 bg-site-orange px-7 text-base font-bold text-site-orange-foreground shadow-site-float hover:bg-site-orange/90"
              onClick={() => trackEvent("cta_click", { cta: "hero_primary" })}
            >
              <Link to={withUtm("/contato")}>
                Falar com especialista
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 border-white/30 bg-transparent px-7 text-base font-bold text-white hover:bg-white/10 hover:text-white"
              onClick={() => trackEvent("cta_click", { cta: "hero_secondary" })}
            >
              <Link to={withUtm("/planos")}>Conhecer os planos</Link>
            </Button>
          </div>

          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2.5 text-sm font-semibold text-white/75">
            {PROOFS.map((proof) => (
              <li key={proof} className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-site-orange" />
                {proof}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <img
            src={heroImage}
            alt="Proprietária de restaurante acompanhando os números do negócio no balcão do salão"
            width={1280}
            height={960}
            className="w-full rounded-site-lg border border-white/12 object-cover shadow-site-float"
          />
        </div>
      </div>
    </section>
  );
}
