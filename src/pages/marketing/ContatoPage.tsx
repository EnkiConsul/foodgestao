import { useSearchParams } from "react-router-dom";
import { Mail, MessageCircle, MapPin, Clock } from "lucide-react";
import { SiteLayout } from "@/components/marketing/SiteLayout";
import { SiteSeo } from "@/components/marketing/SiteSeo";
import { Section, SectionHeading, SiteCard } from "@/components/marketing/primitives";
import { LeadForm } from "@/components/marketing/LeadForm";
import { useMktContact } from "@/hooks/useMarketingContent";

export default function ContatoPage() {
  const [params] = useSearchParams();
  const { data: contact } = useMktContact();
  const raw = params.get("solucao");
  const defaultInterest =
    raw === "financeiro" || raw === "dp" || raw === "ambos" ? (raw as "financeiro" | "dp" | "ambos") : undefined;

  return (
    <SiteLayout breadcrumbs={[{ name: "Contato", path: "/contato" }]}>
      <SiteSeo
        title="Fale com o time 360°FOOD"
        description="Conte como funciona a gestão do seu bar, restaurante ou rede e receba uma apresentação das soluções Financeiro 360° e Pessoas 360°."
        path="/contato"
      />

      <Section labelledBy="contato-hero">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <SectionHeading
              id="contato-hero"
          as="h1"
              align="left"
              eyebrow="Contato"
              title="Vamos entender sua operação"
              description="Preencha o formulário e nosso time entra em contato pelo WhatsApp ou e-mail informado."
            />

            <ul className="mt-8 space-y-4">
              {contact?.email && (
                <SiteCard as="li" className="flex items-start gap-3 list-none">
                  <Mail className="mt-0.5 h-5 w-5 text-site-orange" />
                  <div>
                    <p className="text-sm font-bold text-site-ink">E-mail</p>
                    <a href={`mailto:${contact.email}`} className="text-sm text-site-muted hover:text-site-orange">
                      {contact.email}
                    </a>
                  </div>
                </SiteCard>
              )}
              {contact?.whatsapp && (
                <SiteCard as="li" className="flex items-start gap-3 list-none">
                  <MessageCircle className="mt-0.5 h-5 w-5 text-site-orange" />
                  <div>
                    <p className="text-sm font-bold text-site-ink">WhatsApp</p>
                    <p className="text-sm text-site-muted">{contact.whatsapp_label ?? contact.whatsapp}</p>
                  </div>
                </SiteCard>
              )}
              {contact?.address && (
                <SiteCard as="li" className="flex items-start gap-3 list-none">
                  <MapPin className="mt-0.5 h-5 w-5 text-site-orange" />
                  <div>
                    <p className="text-sm font-bold text-site-ink">Endereço</p>
                    <p className="text-sm text-site-muted">{contact.address}</p>
                  </div>
                </SiteCard>
              )}
              {contact?.hours && (
                <SiteCard as="li" className="flex items-start gap-3 list-none">
                  <Clock className="mt-0.5 h-5 w-5 text-site-orange" />
                  <div>
                    <p className="text-sm font-bold text-site-ink">Atendimento</p>
                    <p className="text-sm text-site-muted">{contact.hours}</p>
                  </div>
                </SiteCard>
              )}
            </ul>
          </div>

          <LeadForm defaultInterest={defaultInterest} />
        </div>
      </Section>
    </SiteLayout>
  );
}
