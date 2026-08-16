import { Link } from "react-router-dom";
import { Mail, MessageCircle, MapPin, Clock, Instagram, Linkedin, Facebook } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useMktContact } from "@/hooks/useMarketingContent";
import { trackEvent } from "@/lib/analytics";

const COLUMNS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: "Soluções",
    links: [
      { label: "Financeiro 360°", to: "/financeiro" },
      { label: "DP 360°", to: "/departamento-pessoal" },
      { label: "Planos", to: "/planos" },
    ],
  },
  {
    title: "Conteúdo",
    links: [
      { label: "Cases", to: "/cases" },
      { label: "Blog", to: "/blog" },
      { label: "Guia do DAS MEI", to: "/guias/das-mei" },
    ],
  },
  {
    title: "360°FOOD",
    links: [
      { label: "Quem somos", to: "/quem-somos" },
      { label: "Contato", to: "/contato" },
      { label: "Acessar o sistema", to: "/auth" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Política de Privacidade", to: "/politica-de-privacidade" },
      { label: "Termos de Uso", to: "/termos-de-uso" },
      { label: "Cookies", to: "/cookies" },
      { label: "Encarregado de dados", to: "/encarregado-dados" },
    ],
  },
];

export function SiteFooter() {
  const { data: contact } = useMktContact();
  const whatsappDigits = (contact?.whatsapp || "").replace(/\D/g, "");

  return (
    <footer className="bg-site-navy text-white/80">
      <div className="site-container py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Logo linkTo="/" size="sm" className="h-9" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed">
              Plataforma de gestão para bares, restaurantes e negócios de alimentação, com soluções de Financeiro e
              Departamento Pessoal.
            </p>
            <div className="mt-5 flex gap-3">
              {contact?.instagram && (
                <a href={contact.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className="rounded-full bg-white/10 p-2 hover:bg-white/20">
                  <Instagram className="h-4 w-4" />
                </a>
              )}
              {contact?.linkedin && (
                <a href={contact.linkedin} target="_blank" rel="noreferrer" aria-label="LinkedIn" className="rounded-full bg-white/10 p-2 hover:bg-white/20">
                  <Linkedin className="h-4 w-4" />
                </a>
              )}
              {contact?.facebook && (
                <a href={contact.facebook} target="_blank" rel="noreferrer" aria-label="Facebook" className="rounded-full bg-white/10 p-2 hover:bg-white/20">
                  <Facebook className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-sm font-bold uppercase tracking-wide text-white">{column.title}</h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="transition-colors hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-white">Atendimento</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {contact?.email && (
                <li className="flex items-start gap-2">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                  <a href={`mailto:${contact.email}`} className="hover:text-white">
                    {contact.email}
                  </a>
                </li>
              )}
              {whatsappDigits && (
                <li className="flex items-start gap-2">
                  <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <a
                    href={`https://wa.me/${whatsappDigits}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white"
                    onClick={() => trackEvent("whatsapp_click", { origem: "footer" })}
                  >
                    {contact?.whatsapp_label || whatsappDigits}
                  </a>
                </li>
              )}
              {contact?.hours && (
                <li className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{contact.hours}</span>
                </li>
              )}
              {contact?.address && (
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{contact.address}</span>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} 360°FOOD. Todos os direitos reservados.</p>
          <p>Feito para quem faz a alimentação acontecer.</p>
        </div>
      </div>
    </footer>
  );
}
