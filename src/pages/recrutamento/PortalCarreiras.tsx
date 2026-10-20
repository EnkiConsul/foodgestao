import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { MapPin, Briefcase, Users, Sparkles, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TIPOS_CONTRATACAO } from "@/lib/recrutamento/vagas";
import { SEM_VAGAS_TEXTO, portalPublico } from "@/lib/recrutamento/portal";
import assinatura360 from "@/assets/aveto360-assinatura.png.asset.json";

export default function PortalCarreiras() {
  const { slug = "" } = useParams();
  const q = useQuery({ queryKey: ["portal-publico", slug], queryFn: () => portalPublico(slug) });
  const p = q.data;

  return (
    <div className="min-h-[100dvh] bg-muted/40">
      <Helmet>
        <title>{p ? `Trabalhe na ${p.empresa}` : "Portal de Carreiras"} | AVETO Recrutamento 360</title>
        <meta name="description" content={p ? `Vagas e Banco de Talentos da ${p.empresa}.` : "Portal de Carreiras AVETO 360."} />
      </Helmet>
      <header className="bg-background border-b">
        <div className="mx-auto max-w-xl px-4 py-3 flex items-center justify-between">
          <img src={assinatura360.url} alt="AVETO 360" className="h-8 w-auto" />
          <span className="text-xs text-muted-foreground">Portal de Carreiras</span>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-5 space-y-4">
        {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {q.isError && <p className="text-sm text-destructive">Não foi possível carregar o portal. Tente novamente.</p>}
        {q.isSuccess && !p && <Card><CardContent className="p-5 text-sm">Portal não encontrado.</CardContent></Card>}
        {p && (
          <>
            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-3">
                  {p.logo_url && <img src={p.logo_url} alt="" className="h-14 w-14 rounded-md object-contain border bg-background" />}
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Trabalhe conosco</p>
                    <h1 className="text-xl font-bold leading-tight break-words">{p.empresa}</h1>
                  </div>
                </div>
                {p.regiao && <p className="flex gap-2 text-sm"><MapPin className="h-4 w-4 shrink-0 text-primary" />{p.regiao}</p>}
                {p.apresentacao && <p className="text-sm text-muted-foreground whitespace-pre-line">{p.apresentacao}</p>}
              </CardContent>
            </Card>

            <section className="space-y-2">
              <h2 className="text-base font-semibold">Vagas abertas</h2>
              {p.vagas.length === 0 && <Card><CardContent className="p-4 text-sm">{SEM_VAGAS_TEXTO}</CardContent></Card>}
              {p.vagas.map((v) => (
                <Card key={v.codigo}>
                  <CardContent className="p-4 space-y-2">
                    <h3 className="font-semibold break-words">{v.titulo}</h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary" className="gap-1"><Briefcase className="h-3 w-3" />{TIPOS_CONTRATACAO[v.tipo_contratacao] ?? v.tipo_contratacao}</Badge>
                      <Badge variant="secondary" className="gap-1"><Users className="h-3 w-3" />{v.quantidade} {v.quantidade > 1 ? "vagas" : "vaga"}</Badge>
                    </div>
                    {(v.unidade || v.cidade) && <p className="flex gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" />{[v.unidade, v.bairro, v.cidade].filter(Boolean).join(" · ")}</p>}
                    {v.jornada && <p className="flex gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4 shrink-0" />{v.jornada}</p>}
                    <Button asChild className="w-full h-11"><Link to={`/vagas/${v.codigo}`}>Ver vaga e candidatar-se</Link></Button>
                  </CardContent>
                </Card>
              ))}
            </section>

            <Card className="border-primary/40">
              <CardContent className="p-5 space-y-3">
                <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" />Banco de Talentos</h2>
                <p className="text-sm text-muted-foreground">Deixe seu perfil com a {p.empresa} para futuras oportunidades, mesmo sem vaga aberta.</p>
                <Button asChild className="w-full h-11"><Link to={`/carreiras/${p.slug}/talentos`}>Entrar no Banco de Talentos</Link></Button>
                <p className="text-xs text-center text-muted-foreground">O cadastro é gratuito para o candidato.</p>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
