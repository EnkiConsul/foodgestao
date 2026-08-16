import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading, SiteCard } from "../primitives";
import { Reveal } from "../Reveal";
import { Fidelidade360 } from "./Fidelidade360";
import { FINANCE_PLANS, PLAN_FEATURE_ROWS, formatBRL } from "@/lib/marketing/content";
import { withUtm } from "@/lib/marketing/utm";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

type Tab = "financeiro" | "dp";

export function PlansSection({
  showComparison = false,
  defaultTab = "financeiro",
  showFidelidade = true,
}: {
  showComparison?: boolean;
  defaultTab?: Tab;
  showFidelidade?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [comparing, setComparing] = useState(showComparison);

  return (
    <Section id="planos" variant="surface" labelledBy="planos-title">
      <SectionHeading
        id="planos-title"
        eyebrow="Planos"
        title="Preços claros para cada momento da operação"
        description="Contratação por solução. Escolha o módulo para ver as condições."
      />

      <div
        role="tablist"
        aria-label="Solução"
        className="mx-auto mt-8 flex w-full max-w-sm rounded-full border border-site-line bg-card p-1"
      >
        {(
          [
            { key: "financeiro", label: "Financeiro 360°" },
            { key: "dp", label: "Pessoas 360°" },
          ] as const
        ).map((option) => (
          <button
            key={option.key}
            role="tab"
            aria-selected={tab === option.key}
            onClick={() => {
              setTab(option.key);
              trackEvent("view_pricing", { modulo: option.key });
            }}
            className={cn(
              "flex-1 rounded-full px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-orange",
              tab === option.key ? "bg-site-navy text-site-navy-foreground" : "text-site-muted hover:text-site-ink",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === "financeiro" ? (
        <>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {FINANCE_PLANS.map((plan, index) => (
              <Reveal key={plan.slug} delay={index * 80}>
                <div
                  className={cn(
                    "flex h-full flex-col rounded-site-lg border bg-card p-7 shadow-site-card",
                    plan.highlight ? "border-site-orange ring-1 ring-site-orange/30" : "border-site-line",
                  )}
                >
                  {plan.highlight && (
                    <span className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent-foreground">
                      <Sparkles className="h-3.5 w-3.5" /> Mais escolhido
                    </span>
                  )}
                  <h3 className="text-lg font-extrabold text-site-ink">{plan.name}</h3>
                  <p className="mt-2 min-h-[2.5rem] text-sm leading-snug text-site-muted">{plan.tagline}</p>
                  <p className="mt-5 flex items-end gap-1">
                    <span className="text-3xl font-extrabold text-site-ink">{formatBRL(plan.price)}</span>
                    <span className="pb-1 text-sm font-semibold text-site-muted">/mês</span>
                  </p>
                  <ul className="mt-6 space-y-2.5 border-t border-site-line pt-6 text-sm">
                    {PLAN_FEATURE_ROWS.map((row) => (
                      <li key={row.key} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-site-success" strokeWidth={3} />
                        <span className="text-site-ink">
                          <span className="text-site-muted">{row.label}: </span>
                          <strong className="font-bold">{plan.limits[row.key]}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    className={cn(
                      "mt-7 h-11 w-full font-bold",
                      plan.highlight
                        ? "bg-site-orange text-site-orange-foreground hover:bg-site-orange/90"
                        : "bg-site-navy text-site-navy-foreground hover:bg-site-navy/90",
                    )}
                    onClick={() => trackEvent("cta_click", { cta: "plano", plano: plan.slug })}
                  >
                    <Link to={withUtm(`/contato?plano=${plan.slug}`)}>Começar agora</Link>
                  </Button>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Button variant="outline" onClick={() => setComparing((v) => !v)} aria-expanded={comparing}>
              {comparing ? "Ocultar comparação" : "Comparar todos os recursos"}
            </Button>
          </div>

          {comparing && (
            <div className="mt-8">
              {/* Desktop: tabela */}
              <div className="hidden overflow-hidden rounded-site-lg border border-site-line bg-card md:block">
                <table className="w-full text-sm">
                  <caption className="sr-only">Comparação de recursos dos planos do Financeiro 360°</caption>
                  <thead>
                    <tr className="bg-site-surface">
                      <th scope="col" className="px-5 py-3.5 text-left font-bold text-site-ink">
                        Recurso
                      </th>
                      {FINANCE_PLANS.map((plan) => (
                        <th key={plan.slug} scope="col" className="px-5 py-3.5 text-right font-bold text-site-ink">
                          {plan.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-site-line">
                      <th scope="row" className="px-5 py-3.5 text-left font-semibold text-site-muted">
                        Mensalidade
                      </th>
                      {FINANCE_PLANS.map((plan) => (
                        <td key={plan.slug} className="px-5 py-3.5 text-right font-bold text-site-ink">
                          {formatBRL(plan.price)}
                        </td>
                      ))}
                    </tr>
                    {PLAN_FEATURE_ROWS.map((row) => (
                      <tr key={row.key} className="border-t border-site-line">
                        <th scope="row" className="px-5 py-3.5 text-left font-semibold text-site-muted">
                          {row.label}
                        </th>
                        {FINANCE_PLANS.map((plan) => (
                          <td key={plan.slug} className="px-5 py-3.5 text-right text-site-ink">
                            {plan.limits[row.key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: cards com as mesmas informações */}
              <div className="grid gap-4 md:hidden">
                {FINANCE_PLANS.map((plan) => (
                  <SiteCard key={plan.slug}>
                    <p className="text-base font-extrabold text-site-ink">{plan.name}</p>
                    <p className="mt-1 text-sm font-bold text-site-orange">{formatBRL(plan.price)}/mês</p>
                    <dl className="mt-4 space-y-2 text-sm">
                      {PLAN_FEATURE_ROWS.map((row) => (
                        <div key={row.key} className="flex justify-between gap-3 border-b border-site-line pb-2">
                          <dt className="text-site-muted">{row.label}</dt>
                          <dd className="text-right font-bold text-site-ink">{plan.limits[row.key]}</dd>
                        </div>
                      ))}
                    </dl>
                  </SiteCard>
                ))}
              </div>
            </div>
          )}

          {showFidelidade && <Fidelidade360 />}
        </>
      ) : (
        <div className="mx-auto mt-10 max-w-2xl">
          <SiteCard className="text-center">
            <h3 className="text-xl font-extrabold text-site-ink">Planos do Pessoas 360° sob consulta</h3>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-site-muted">
              As condições comerciais do Departamento Pessoal são apresentadas de acordo com o número de colaboradores e
              unidades da sua operação. Fale com nosso time para conhecer os planos.
            </p>
            <Button
              asChild
              className="mt-6 h-11 bg-site-orange px-6 font-bold text-site-orange-foreground hover:bg-site-orange/90"
              onClick={() => trackEvent("cta_click", { cta: "consulte_planos_dp" })}
            >
              <Link to={withUtm("/contato?solucao=dp")}>Consulte os planos</Link>
            </Button>
          </SiteCard>
        </div>
      )}
    </Section>
  );
}
