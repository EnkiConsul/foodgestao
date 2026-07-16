import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MessageSquare, Megaphone, FileText, ArrowRight } from "lucide-react";

const CARDS = [
  { icon: MessageSquare, label: "Mensagens", desc: "Envie mensagens diretas e broadcasts para colaboradores.", to: "/dp/mensagens" },
  { icon: Megaphone, label: "Quadro de Avisos", desc: "Comunicados corporativos com escopo e prioridade.", to: "/dp/avisos" },
  { icon: FileText, label: "Modelos de Mensagem", desc: "Templates para WhatsApp, e-mail e SMS.", to: "/dp/modelos-mensagem" },
];

export default function DpComunicacaoHub() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Helmet><title>Comunicação — DP 360°</title></Helmet>
      <header>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Comunicação</h1>
        </div>
        <p className="text-muted-foreground text-sm ml-8">Centralize avisos, mensagens e modelos.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="rounded-2xl border-2 border-[hsl(var(--dp-border))] bg-white p-5 hover:border-primary transition-colors group"
          >
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
              <c.icon className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-semibold flex items-center gap-2">
              {c.label}
              <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </h2>
            <p className="text-xs text-muted-foreground mt-1">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
