import { Helmet } from "react-helmet-async";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Section, SectionHeading } from "./primitives";
import { useMktFaqs } from "@/hooks/useMarketingContent";
import { trackEvent } from "@/lib/analytics";

export function FaqSection({
  scope,
  title = "Perguntas frequentes",
  description,
}: {
  scope: "home" | "financeiro" | "dp" | "planos";
  title?: string;
  description?: string;
}) {
  const { data: faqs = [] } = useMktFaqs(scope);
  if (faqs.length === 0) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <Section id="faq" variant="surface" labelledBy="faq-title">
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>
      <SectionHeading id="faq-title" eyebrow="Dúvidas" title={title} description={description} />
      <div className="mx-auto mt-10 max-w-3xl">
        <Accordion type="single" collapsible className="space-y-3">
          {faqs.map((faq) => (
            <AccordionItem
              key={faq.id}
              value={faq.id}
              className="overflow-hidden rounded-site-md border border-site-line bg-card px-4"
            >
              <AccordionTrigger
                className="py-4 text-left text-sm font-bold text-site-ink hover:no-underline sm:text-base"
                onClick={() => trackEvent("faq_open", { pergunta: faq.question.slice(0, 80), escopo: scope })}
              >
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-sm leading-relaxed text-site-muted">{faq.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}
