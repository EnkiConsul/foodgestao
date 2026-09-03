import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, AlertTriangle, Calendar, Calculator, FileText } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";

const PAGE_URL = "https://www.gestor360food.com/guias/das-mei";
const TITLE = "DAS MEI 2026: o que é, valores, prazos e como pagar";
const DESCRIPTION =
  "Guia completo do DAS MEI: o que é, valores atualizados de 2026, datas de vencimento, como emitir o boleto, o que acontece se atrasar e dicas para se organizar.";

const faq = [
  {
    q: "O que é o DAS MEI?",
    a: "DAS MEI (Documento de Arrecadação do Simples Nacional para Microempreendedor Individual) é a guia única mensal que reúne os tributos pagos pelo MEI: INSS, ICMS e/ou ISS, dependendo da atividade exercida.",
  },
  {
    q: "Qual o valor do DAS MEI em 2026?",
    a: "O valor base é 5% do salário-mínimo (INSS) somado a R$ 1,00 de ICMS (comércio/indústria) e/ou R$ 5,00 de ISS (serviços). Comércio e indústria pagam aproximadamente R$ 76,90; serviços R$ 80,90; comércio e serviços R$ 81,90 (valores de referência para 2026, conforme reajuste do salário-mínimo).",
  },
  {
    q: "Quando vence o DAS MEI?",
    a: "Todo dia 20 de cada mês. Se cair em fim de semana ou feriado, o vencimento é prorrogado para o próximo dia útil.",
  },
  {
    q: "O que acontece se eu atrasar o DAS MEI?",
    a: "Há cobrança de multa de 0,33% ao dia (limitada a 20%) e juros pela taxa Selic. Atrasos prolongados podem levar à perda de benefícios previdenciários e ao desenquadramento do MEI.",
  },
  {
    q: "Como emitir o boleto do DAS MEI?",
    a: "Acesse o Portal do Empreendedor (gov.br/mei), entre com sua conta gov.br, vá em 'Já sou MEI > Pagamento de Contribuição Mensal' e gere a guia em PDF ou pague via PIX.",
  },
];

export default function DasMei() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: TITLE,
    description: DESCRIPTION,
    author: { "@type": "Organization", name: "Aveto 360" },
    publisher: {
      "@type": "Organization",
      name: "Aveto 360",
      logo: { "@type": "ImageObject", url: "https://www.gestor360food.com/icon-512.png" },
    },
    mainEntityOfPage: PAGE_URL,
    datePublished: "2026-06-30",
    dateModified: "2026-06-30",
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />
        <script type="application/ld+json">{JSON.stringify(articleLd)}</script>
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>
      <BreadcrumbJsonLd
        items={[
          { name: "Guias", path: "/guias" },
          { name: "DAS MEI 2026", path: "/guias/das-mei" },
        ]}
      />

      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="container mx-auto flex h-14 items-center justify-between px-3 sm:h-16 sm:px-4">
          <Logo size="sm" linkTo="/" />
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
          <ol className="flex items-center gap-2">
            <li><Link to="/" className="hover:text-foreground">Início</Link></li>
            <li aria-hidden>/</li>
            <li>Guias</li>
            <li aria-hidden>/</li>
            <li className="text-foreground">DAS MEI</li>
          </ol>
        </nav>

        <article className="prose prose-slate max-w-none dark:prose-invert prose-headings:tracking-tight prose-h1:text-3xl prose-h1:font-bold prose-h2:text-2xl prose-h2:mt-10 prose-h3:text-lg prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
          <h1>DAS MEI 2026: o que é, valores, prazos e como pagar</h1>
          <p className="lead">
            Se você é <strong>Microempreendedor Individual (MEI)</strong>, o DAS é a sua principal
            obrigação mensal. Neste guia explicamos de forma simples o que é o DAS MEI, quanto custa
            em 2026, quando vence, como pagar e o que fazer se atrasar.
          </p>

          <h2 id="o-que-e">O que é o DAS MEI</h2>
          <p>
            O <strong>DAS (Documento de Arrecadação do Simples Nacional)</strong> é a guia única que
            o MEI paga todo mês. Em um único boleto estão reunidos os tributos devidos pelo
            empreendedor:
          </p>
          <ul>
            <li><strong>INSS</strong>: 5% do salário-mínimo vigente — dá direito à aposentadoria, auxílio-doença, salário-maternidade e pensão por morte.</li>
            <li><strong>ICMS</strong> (R$ 1,00): para MEIs de comércio e indústria.</li>
            <li><strong>ISS</strong> (R$ 5,00): para MEIs prestadores de serviço.</li>
          </ul>

          <h2 id="valores">Valores do DAS MEI em 2026</h2>
          <p>O valor depende da atividade cadastrada no CNPJ:</p>
          <div className="not-prose overflow-x-auto my-6">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-2">Atividade</th>
                  <th className="text-left px-4 py-2">Tributos</th>
                  <th className="text-left px-4 py-2">Valor mensal*</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border"><td className="px-4 py-2">Comércio ou Indústria</td><td className="px-4 py-2">INSS + ICMS</td><td className="px-4 py-2">R$ 76,90</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2">Serviços</td><td className="px-4 py-2">INSS + ISS</td><td className="px-4 py-2">R$ 80,90</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2">Comércio e Serviços</td><td className="px-4 py-2">INSS + ICMS + ISS</td><td className="px-4 py-2">R$ 81,90</td></tr>
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-2">
              *Valores aproximados de referência para 2026, reajustados conforme o salário-mínimo. Consulte sempre o Portal do Empreendedor para o valor exato.
            </p>
          </div>

          <h2 id="prazo"><Calendar className="inline h-5 w-5 mr-1 -mt-1" />Quando vence o DAS MEI</h2>
          <p>
            O vencimento é sempre <strong>dia 20 de cada mês</strong>, referente à competência do mês
            anterior. Se o dia 20 cair em fim de semana ou feriado nacional, o prazo é prorrogado para
            o próximo dia útil.
          </p>

          <h2 id="como-pagar">Como emitir e pagar o DAS MEI</h2>
          <ol>
            <li>Acesse o <a href="https://www.gov.br/empresas-e-negocios/pt-br/empreendedor" target="_blank" rel="noopener noreferrer">Portal do Empreendedor</a>.</li>
            <li>Clique em <em>"Já sou MEI" → "Pagamento de Contribuição Mensal"</em>.</li>
            <li>Faça login com sua conta gov.br.</li>
            <li>Selecione o ano e os meses desejados.</li>
            <li>Gere o boleto em PDF ou pague direto com <strong>PIX</strong> (QR Code disponível na guia).</li>
          </ol>

          <h2 id="atraso"><AlertTriangle className="inline h-5 w-5 mr-1 -mt-1 text-amber-500" />O que acontece se atrasar</h2>
          <ul>
            <li><strong>Multa</strong> de 0,33% ao dia, limitada a 20% do valor do DAS.</li>
            <li><strong>Juros</strong> pela taxa Selic acumulada.</li>
            <li>Perda temporária de <strong>benefícios previdenciários</strong> (auxílio-doença, salário-maternidade).</li>
            <li>Risco de <strong>desenquadramento</strong> do MEI e inscrição na Dívida Ativa da União.</li>
          </ul>

          <h2 id="dasn"><FileText className="inline h-5 w-5 mr-1 -mt-1" />DASN-SIMEI: a declaração anual</h2>
          <p>
            Além do DAS mensal, todo MEI precisa entregar a <strong>DASN-SIMEI</strong> (Declaração Anual
            do Simples Nacional) até <strong>31 de maio</strong> de cada ano, informando o faturamento do
            ano anterior. A entrega é gratuita e feita no próprio Portal do Empreendedor.
          </p>

          <h2 id="organizacao"><Calculator className="inline h-5 w-5 mr-1 -mt-1" />Como se organizar para nunca esquecer o DAS</h2>
          <ul>
            <li><CheckCircle2 className="inline h-4 w-4 mr-1 text-emerald-500" />Cadastre o DAS como <strong>lançamento recorrente</strong> no seu sistema de gestão.</li>
            <li><CheckCircle2 className="inline h-4 w-4 mr-1 text-emerald-500" />Programe lembretes para o dia 15 — 5 dias antes do vencimento.</li>
            <li><CheckCircle2 className="inline h-4 w-4 mr-1 text-emerald-500" />Reserve mensalmente o valor em uma <strong>conta separada</strong> para impostos.</li>
            <li><CheckCircle2 className="inline h-4 w-4 mr-1 text-emerald-500" />Acompanhe o faturamento para não ultrapassar o limite de R$ 81.000/ano do MEI.</li>
          </ul>

          <div className="not-prose my-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
            <h3 className="text-lg font-semibold mb-2">Controle seu MEI no Aveto 360</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Cadastre o DAS como recorrência, receba lembretes de vencimento e acompanhe o
              faturamento anual em tempo real. Teste grátis por 7 dias, sem cartão de crédito.
            </p>
            <Button asChild>
              <Link to="/auth">Começar grátis</Link>
            </Button>
          </div>

          <h2 id="faq">Perguntas frequentes sobre o DAS MEI</h2>
          {faq.map((f) => (
            <div key={f.q}>
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </article>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link to="/privacidade" className="hover:text-foreground">Privacidade</Link>
          <Link to="/termos" className="hover:text-foreground">Termos</Link>
          <Link to="/cookies" className="hover:text-foreground">Cookies</Link>
          <Link to="/encarregado-dados" className="hover:text-foreground">DPO</Link>
        </div>
        <p className="mt-3">© {new Date().getFullYear()} Aveto 360</p>
      </footer>
    </div>
  );
}
