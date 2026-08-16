import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MessageSquare, Bell, ArrowRight, Cake } from "lucide-react";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { AniversariantesCard } from "@/components/dp/home/AniversariantesCard";

const CARDS = [
  {
    icon: MessageSquare,
    label: "Comunicados",
    desc: "Envie mensagens para colaboradores.",
    to: "/dp/mensagens",
  },
  {
    icon: Bell,
    label: "Quadro de Avisos",
    desc: "Crie avisos para os colaboradores.",
    to: "/dp/avisos",
  },
];

export default function DpComunicacaoHub() {
  return (
    <DpPage narrow>
      <Helmet><title>Comunicação — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={MessageSquare}
        title="Comunicação"
        description="Gerencie comunicados, avisos e confraternize com os aniversariantes da equipe."
      />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Cake className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Aniversariantes dos Próximos 30 Dias</h2>
        </div>
        <AniversariantesCard />
      </section>

      <div className="grid gap-4 md:grid-cols-2 mt-6">
        {CARDS.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="dp-content-card rounded-2xl border-2 border-[hsl(var(--dp-border))] bg-card p-6 hover:border-primary transition-colors group"
          >
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <c.icon className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
              {c.label}
              <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </h3>
            <p className="text-sm text-muted-foreground mt-1">{c.desc}</p>
          </Link>
        ))}
      </div>
    </DpPage>
  );
}
