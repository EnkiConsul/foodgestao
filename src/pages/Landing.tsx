import { Link } from "react-router-dom";
import { LogIn, MessageCircle, Instagram, Users, Wallet, CalendarDays, Rocket } from "lucide-react";
import { ReclameAquiSeal } from "@/components/marketing/ReclameAquiSeal";
import imgGestora from "@/assets/site-gestor-indicadores.jpg";
import imgEquipe from "@/assets/site-equipe-turno.jpg";
import imgGarcom from "@/assets/landing-garcom.jpg";

const WHATSAPP = "https://wa.me/5562992365959?text=Ol%C3%A1!%20Quero%20conhecer%20o%20Aveto%20360.";
const INSTAGRAM = "https://www.instagram.com/aveto360";

const G = ({ children }: { children: React.ReactNode }) => (
  <strong className="font-extrabold text-lp-green">{children}</strong>
);

function Marca({ grande = false }: { grande?: boolean }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 font-extrabold tracking-[0.18em] ${grande ? "text-3xl" : "text-xl"}`} aria-label="Aveto 360">
      AVETO <span className="text-lp-green">360</span>
    </span>
  );
}

const CONTRATAR_CLS = "inline-flex min-h-12 items-center gap-2 rounded-full bg-lp-green px-6 font-bold text-lp-bg transition-colors hover:bg-lp-green-dark hover:text-lp-text";
const SECUNDARIO_CLS = "inline-flex min-h-12 items-center gap-2 rounded-full border border-lp-text/30 px-6 font-bold hover:border-lp-green";

function Triangulos() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-40 top-10 h-[520px] w-[520px] rotate-12 bg-lp-green/10 [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
      <div className="absolute -right-32 bottom-0 h-[420px] w-[420px] -rotate-6 bg-lp-green-dark/20 [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
    </div>
  );
}

function Secao({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`relative overflow-hidden px-6 py-20 md:py-28 ${className}`}>
      <Triangulos />
      <div className="relative mx-auto max-w-5xl">{children}</div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-lp-bg font-montserrat text-lp-text">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Marca />
          <Link
            to="/login"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-lp-green px-5 text-sm font-bold text-lp-text transition-colors hover:bg-lp-green hover:text-lp-bg"
          >
            <LogIn className="h-4 w-4" /> Entrar
          </Link>
        </div>
      </header>

      {/* Abertura */}
      <section className="relative overflow-hidden bg-gradient-to-b from-lp-deep to-lp-bg px-6 pb-16 pt-32">
        <Triangulos />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
          <div>
            <h1 className="text-4xl font-medium leading-tight md:text-6xl">
              O seu negócio acontece em <G>360°</G>
            </h1>
            <p className="mt-4 text-xl md:text-2xl">Sua gestão também <G>deveria.</G></p>
            <p className="mt-6 max-w-md text-lp-muted">
              Gestão de pessoas e financeira para bares e restaurantes, em um só lugar.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/cadastro" className={CONTRATAR_CLS}>
                <Rocket className="h-5 w-5" /> Começar Agora
              </Link>
              <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className={SECUNDARIO_CLS}>
                <MessageCircle className="h-5 w-5" /> Falar Conosco
              </a>
            </div>
          </div>
          <img src={imgGestora} alt="Dona de restaurante acompanhando a operação no balcão" width={1280} height={960} className="mx-auto w-full rounded-3xl object-cover shadow-2xl" />
        </div>
      </section>

      {/* A dor */}
      <Secao>
        <h2 className="text-3xl font-medium leading-tight md:text-5xl">
          Sábado, oito da noite. <G>Casa cheia.</G>
        </h2>
        <p className="mt-4 text-xl">E o garçom avisa que <strong className="font-bold">não vem.</strong></p>
        <p className="mt-2 text-xl text-lp-green font-bold">E o problema começou bem antes disso.</p>
        <div className="mt-8 max-w-sm rounded-2xl border border-lp-green/30 bg-lp-deep/80 p-4">
          <p className="text-xs text-lp-muted">Garçom · 19:59</p>
          <p className="font-bold">Oi, não irei hoje!</p>
        </div>
      </Secao>

      <Secao className="bg-lp-deep/40">
        <h2 className="text-3xl font-medium leading-tight md:text-5xl">
          Alguém <G>trocou a folga</G> no grupo do WhatsApp.
        </h2>
        <p className="mt-4 text-xl"><strong className="font-bold">Ninguém</strong> registrou.</p>
        <p className="mt-6 text-lg">Na semana seguinte, o funcionário <G>cobra a folga combinada.</G></p>
        <p className="mt-2 text-lp-muted">O gerente procura a conversa... ninguém lembra exatamente o que ficou acertado.</p>
        <img src={imgEquipe} alt="Equipe de restaurante na troca de turno" loading="lazy" width={1280} height={960} className="mt-10 w-full rounded-3xl object-cover" />
      </Secao>

      {/* Informação espalhada */}
      <Secao>
        <h2 className="text-3xl font-medium leading-tight md:text-5xl">
          E quando você olha para a <G>gestão da equipe:</G>
        </h2>
        <ul className="mt-10 grid max-w-xl gap-4">
          {[["Escala no", "caderno"], ["Folga no", "WhatsApp"], ["Férias na", "planilha"], ["Documento na", "pasta"]].map(([a, b]) => (
            <li key={b} className="rounded-full border border-lp-green/50 bg-gradient-to-r from-lp-green-dark/40 to-transparent px-6 py-3 text-center text-lg">
              {a} <strong className="font-extrabold">{b}</strong>
            </li>
          ))}
        </ul>
      </Secao>

      {/* Problema real */}
      <Secao className="bg-lp-deep/40">
        <div className="relative mx-auto max-w-3xl p-10 text-center md:p-16">
          {["left-0 top-0 border-l-2 border-t-2", "right-0 top-0 border-r-2 border-t-2", "left-0 bottom-0 border-l-2 border-b-2", "right-0 bottom-0 border-r-2 border-b-2"].map((c) => (
            <span key={c} aria-hidden className={`absolute h-10 w-10 border-lp-green ${c}`} />
          ))}
          <h2 className="text-3xl font-medium leading-tight md:text-5xl">
            O problema não é uma <G>mensagem perdida</G>
          </h2>
          <p className="mt-4 text-lg">
            É <strong className="font-bold">depender de vários lugares diferentes</strong> para encontrar informações da mesma equipe.
          </p>
        </div>
      </Secao>

      {/* Solução */}
      <Secao>
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-medium leading-tight md:text-5xl">
              Foi vivendo situações como essa que nasceu a <G>Aveto 360</G>
            </h2>
            <p className="mt-6 text-lg">
              Uma solução pensada para simplificar a <strong className="font-bold">gestão de pessoas e financeira de bares e restaurantes.</strong>
            </p>
            <div className="mt-8 grid gap-3">
              {[
                { i: Users, t: "Pessoas 360°", d: "Fichas, documentos, recibos e portal do colaborador." },
                { i: CalendarDays, t: "Escala", d: "Escalas, folgas e férias registradas e combinadas." },
                { i: Wallet, t: "Financeiro", d: "Contas, conciliação bancária e fluxo de caixa." },
              ].map(({ i: Icon, t, d }) => (
                <div key={t} className="flex gap-3 rounded-2xl border border-lp-green/20 bg-lp-deep/60 p-4">
                  <Icon className="h-6 w-6 shrink-0 text-lp-green" />
                  <div><p className="font-bold">{t}</p><p className="text-sm text-lp-muted">{d}</p></div>
                </div>
              ))}
            </div>
          </div>
          <img src={imgGarcom} alt="Garçom com bandeja" loading="lazy" width={1024} height={1024} className="w-full rounded-3xl" />
        </div>
      </Secao>

      {/* Fechamento */}
      <Secao className="bg-gradient-to-b from-lp-bg to-lp-deep text-center">
        <Marca grande />
        <h2 className="mt-8 text-3xl font-medium md:text-5xl">E no seu <G>restaurante?</G></h2>
        <p className="mt-4 text-xl">Onde estão hoje as <strong className="font-bold">informações da sua equipe?</strong></p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/cadastro" className={CONTRATAR_CLS}>
            <Rocket className="h-5 w-5" /> Começar Agora
          </Link>
          <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className={SECUNDARIO_CLS}>
            <MessageCircle className="h-5 w-5" /> Falar Conosco
          </a>
          <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center gap-2 rounded-full border border-lp-text/30 px-6 font-bold hover:border-lp-green">
            <Instagram className="h-5 w-5" /> @aveto360
          </a>
        </div>
      </Secao>

      <footer className="border-t border-lp-graphite px-6 py-8 text-sm text-lp-muted">
        <div className="mx-auto max-w-6xl">
          {/* Selo verificado do Reclame Aqui: âncora de confiança no rodapé.
              Não carrega em homologação; falha de rede deixa a área vazia. */}
          <div className="mb-6 flex justify-center">
            <ReclameAquiSeal />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p><strong className="text-lp-text">AVETO 360</strong> · Gestão para bares e restaurantes</p>
            <nav className="flex gap-4">
              <Link to="/termos" className="hover:text-lp-green">Termos</Link>
              <Link to="/privacidade" className="hover:text-lp-green">Privacidade</Link>
              <Link to="/cookies" className="hover:text-lp-green">Cookies</Link>
              <Link to="/login" className="hover:text-lp-green">Entrar</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
